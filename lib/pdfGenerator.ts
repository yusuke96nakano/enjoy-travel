import { calculateTotals, lodgingNights, yen } from "./calc";
import { Trip } from "./types";
import { saveMonthlyPdf } from "./monthlyPdfSave";

const pageWidth = 1240;
const pageHeight = 1754;
const margin = 92;
const contentWidth = pageWidth - margin * 2;
const labelWidth = 210;
const black = "#1f2933";
const line = "#111111";
const pale = "#f2f2f2";
const fontFamily = `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;

type DrawPage = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

const fileSafe = (value: string) => value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

const today = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const createPage = (): DrawPage => {
  const canvas = document.createElement("canvas");
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PDF作成に失敗しました。");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  ctx.fillStyle = black;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.textBaseline = "top";
  return { canvas, ctx };
};

const setFont = (ctx: CanvasRenderingContext2D, size: number, weight: "normal" | "bold" = "normal") => {
  ctx.font = `${weight} ${size}px ${fontFamily}`;
};

const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 24,
  weight: "normal" | "bold" = "normal",
  align: CanvasTextAlign = "left",
) => {
  setFont(ctx, size, weight);
  ctx.fillStyle = black;
  ctx.textAlign = align;
  ctx.fillText(text || "-", x, y);
  ctx.textAlign = "left";
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size = 22, weight: "normal" | "bold" = "normal") => {
  setFont(ctx, size, weight);
  const source = (text || "-").split("\n");
  const result: string[] = [];
  for (const paragraph of source) {
    let lineText = "";
    for (const char of paragraph) {
      const next = `${lineText}${char}`;
      if (ctx.measureText(next).width > maxWidth && lineText) {
        result.push(lineText);
        lineText = char;
      } else {
        lineText = next;
      }
    }
    result.push(lineText || "");
  }
  return result;
};

const drawWrapped = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size = 22,
  lineHeight = 38,
  weight: "normal" | "bold" = "normal",
) => {
  const lines = wrapLines(ctx, text, maxWidth, size, weight);
  lines.forEach((lineText, index) => drawText(ctx, lineText, x, y + index * lineHeight, size, weight));
  return y + lines.length * lineHeight;
};

const drawTitle = (ctx: CanvasRenderingContext2D, title: string) => {
  drawText(ctx, title, pageWidth / 2, 96, 34, "bold", "center");
};

const drawFooter = (ctx: CanvasRenderingContext2D, companyName: string, pageNo: number, totalPages: number) => {
  drawText(ctx, companyName, margin, pageHeight - 126, 22);
  drawText(ctx, `${pageNo} / ${totalPages}`, pageWidth - margin, pageHeight - 126, 22, "normal", "right");
};

const drawSection = (ctx: CanvasRenderingContext2D, title: string, y: number) => {
  drawText(ctx, title, margin, y, 26, "bold");
  ctx.beginPath();
  ctx.moveTo(margin, y + 50);
  ctx.lineTo(pageWidth - margin, y + 50);
  ctx.stroke();
  return y + 68;
};

const drawInfoTable = (ctx: CanvasRenderingContext2D, rows: string[][], y: number, fontSize = 22, minRowHeight = 60) => {
  let currentY = y;
  for (const [label, value] of rows) {
    const valueLines = wrapLines(ctx, value || "-", contentWidth - labelWidth - 30, fontSize);
    const rowHeight = Math.max(minRowHeight, valueLines.length * 34 + 16);
    ctx.fillStyle = pale;
    ctx.fillRect(margin, currentY, labelWidth, rowHeight);
    ctx.strokeStyle = line;
    ctx.strokeRect(margin, currentY, labelWidth, rowHeight);
    ctx.strokeRect(margin + labelWidth, currentY, contentWidth - labelWidth, rowHeight);
    drawText(ctx, label, margin + 18, currentY + 18, fontSize, "bold");
    valueLines.forEach((lineText, index) => drawText(ctx, lineText, margin + labelWidth + 18, currentY + 18 + index * 34, fontSize));
    currentY += rowHeight;
  }
  return currentY;
};

const drawDataTable = (
  ctx: CanvasRenderingContext2D,
  headers: string[],
  rows: string[][],
  widths: number[],
  y: number,
  fontSize = 18,
) => {
  let currentY = y;
  const allRows = rows.length ? rows : [headers.map(() => "-")];
  const drawRow = (cells: string[], isHeader = false) => {
    const wrapped = cells.map((cell, index) => wrapLines(ctx, cell || "-", widths[index] - 24, fontSize, isHeader ? "bold" : "normal"));
    const rowHeight = Math.max(52, Math.max(...wrapped.map((cellLines) => cellLines.length)) * 28 + 20);
    let x = margin;
    for (let index = 0; index < cells.length; index += 1) {
      if (isHeader) {
        ctx.fillStyle = pale;
        ctx.fillRect(x, currentY, widths[index], rowHeight);
      }
      ctx.strokeStyle = line;
      ctx.strokeRect(x, currentY, widths[index], rowHeight);
      wrapped[index].forEach((lineText, lineIndex) => drawText(ctx, lineText, x + 12, currentY + 14 + lineIndex * 28, fontSize, isHeader ? "bold" : "normal"));
      x += widths[index];
    }
    currentY += rowHeight;
  };
  drawRow(headers, true);
  allRows.forEach((row) => drawRow(row));
  return currentY;
};

const drawStampBoxes = (ctx: CanvasRenderingContext2D, labels: string[], y: number, height = 92) => {
  const width = contentWidth / labels.length;
  labels.forEach((label, index) => {
    const x = margin + width * index;
    ctx.strokeStyle = line;
    ctx.strokeRect(x, y, width, height);
    drawText(ctx, label, x + width / 2, y + Math.max(10, (height - 20) / 2), 20, "normal", "center");
  });
  return y + height;
};

const splitBase64 = (dataUrl: string) => dataUrl.split(",")[1] ?? "";

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const textBytes = (text: string) => new TextEncoder().encode(text);

const concatBytes = (parts: Uint8Array[]) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
};

const buildPdf = (imageDataUrls: string[]) => {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;
  const add = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? textBytes(part) : part;
    parts.push(bytes);
    byteLength += bytes.length;
  };
  const addObject = (id: number, body: Uint8Array | string) => {
    offsets[id] = byteLength;
    add(`${id} 0 obj\n`);
    add(body);
    add("\nendobj\n");
  };

  add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = imageDataUrls.map((_, index) => 3 + index * 3);
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  imageDataUrls.forEach((dataUrl, index) => {
    const pageObj = 3 + index * 3;
    const imageObj = pageObj + 1;
    const contentObj = pageObj + 2;
    const imageName = `Im${index + 1}`;
    const imageBytes = base64ToBytes(splitBase64(dataUrl));
    const drawCommand = `q\n595 0 0 842 0 0 cm\n/${imageName} Do\nQ\n`;
    const drawBytes = textBytes(drawCommand);
    addObject(pageObj, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /${imageName} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    offsets[imageObj] = byteLength;
    add(`${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    add(imageBytes);
    add("\nendstream\nendobj\n");
    offsets[contentObj] = byteLength;
    add(`${contentObj} 0 obj\n<< /Length ${drawBytes.length} >>\nstream\n`);
    add(drawBytes);
    add("endstream\nendobj\n");
  });

  const xrefOffset = byteLength;
  const objectCount = 2 + imageDataUrls.length * 3;
  add(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    add(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob([concatBytes(parts)], { type: "application/pdf" });
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const shareOrDownloadPdf = async (blob: Blob, filename: string) => {
  const file = new File([blob], filename, { type: "application/pdf" });
  const fileShareData = { files: [file], title: filename };

  if (navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare(fileShareData)) {
        await navigator.share(fileShareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  downloadBlob(blob, filename);
};

const canvasesToPdf = (pages: DrawPage[], filename: string) => {
  const imageDataUrls = pages.map((page) => page.canvas.toDataURL("image/jpeg", 0.94));
  return shareOrDownloadPdf(buildPdf(imageDataUrls), filename);
};

const renderReportPages = (trip: Trip) => {
  const pages: DrawPage[] = [];
  let page = createPage();
  pages.push(page);
  let { ctx } = page;
  const contentBottom = pageHeight - 190;
  const stampHeight = 92;
  const infoRows = [
    ["氏名", trip.profileSnapshot.name],
    ["役職", trip.profileSnapshot.title],
  ];
  const overviewRows = [
    ["出張期間", `${trip.startDate} - ${trip.endDate}`],
    ["出張地域", trip.destination],
    ["出張目的", trip.purpose],
  ];
  const tableHeight = (rows: string[][]) => rows.reduce((height, [, value]) =>
    height + Math.max(60, wrapLines(ctx, value || "-", contentWidth - labelWidth - 30, 22).length * 34 + 16), 0);
  const source = (trip.reportText || "").replace(/\r\n?/g, "\n");

  // Try spacing first, then reduce text in measured steps. 19px on this
  // 1240px-wide A4 canvas is approximately 9.1pt; never go below that.
  const candidates = [
    { fontSize: 21, lineHeight: 38, sectionGap: 54, stampGap: 48 },
    { fontSize: 21, lineHeight: 32, sectionGap: 32, stampGap: 28 },
    { fontSize: 20, lineHeight: 30, sectionGap: 32, stampGap: 28 },
    { fontSize: 19, lineHeight: 29, sectionGap: 32, stampGap: 28 },
  ];
  const measured = candidates.map((layout) => {
    const lines = wrapLines(ctx, source, contentWidth, layout.fontSize);
    const reportY = 176 + tableHeight(infoRows) + tableHeight(overviewRows) +
      2 * (layout.sectionGap + 68);
    return { ...layout, lines, fits: reportY + lines.length * layout.lineHeight +
      layout.stampGap + stampHeight <= contentBottom };
  });
  const layout = measured.find((candidate) => candidate.fits) ?? measured[measured.length - 1];
  drawTitle(ctx, "出張報告書");
  let y = 176;

  const nextPage = (section: string) => {
    page = createPage();
    pages.push(page);
    ctx = page.ctx;
    drawTitle(ctx, "出張報告書（続き）");
    y = drawSection(ctx, section, 176);
  };

  // Keep the existing info table appearance, but split unusually long fields
  // across pages instead of allowing them to overlap the footer or report.
  const drawReportInfo = (rows: string[][]) => {
    for (const [label, value] of rows) {
      const lines = wrapLines(ctx, value || "-", contentWidth - labelWidth - 30, 22);
      let offset = 0;
      while (offset < lines.length) {
        if (y + 60 > contentBottom) nextPage("報告概要（続き）");
        const capacity = Math.max(1, Math.floor((contentBottom - y - 16) / 34));
        const chunk = lines.slice(offset, offset + capacity);
        const height = Math.max(60, chunk.length * 34 + 16);
        ctx.fillStyle = pale;
        ctx.fillRect(margin, y, labelWidth, height);
        ctx.strokeStyle = line;
        ctx.strokeRect(margin, y, labelWidth, height);
        ctx.strokeRect(margin + labelWidth, y, contentWidth - labelWidth, height);
        drawText(ctx, offset === 0 ? label : `${label}（続き）`, margin + 18, y + 18, 22, "bold");
        chunk.forEach((text, index) => drawText(ctx, text, margin + labelWidth + 18, y + 18 + index * 34, 22));
        y += height;
        offset += chunk.length;
      }
    }
  };
  const section = (title: string) => {
    // Reserve a line below each section heading.
    if (y + layout.sectionGap + 68 + 60 > contentBottom) nextPage(title);
    else y = drawSection(ctx, title, y + layout.sectionGap);
  };
  drawReportInfo(infoRows);
  section("報告概要");
  drawReportInfo(overviewRows);
  section("報告事項");

  layout.lines.forEach((lineText, index) => {
    const remaining = layout.lines.length - index;
    // Keep the final few lines with the confirmation boxes where possible.
    const tailHeight = remaining * layout.lineHeight + layout.stampGap + stampHeight;
    if (y + layout.lineHeight > contentBottom ||
        (remaining <= 3 && y + tailHeight > contentBottom)) {
      nextPage("報告事項（続き）");
    }
    if (lineText) drawText(ctx, lineText, margin, y, layout.fontSize);
    y += layout.lineHeight;
  });
  if (y + layout.stampGap + stampHeight > contentBottom) nextPage("報告事項（続き）");
  drawStampBoxes(ctx, ["上席確認欄", "最終確認欄"], y + layout.stampGap);

  pages.forEach((currentPage, index) => {
    drawFooter(currentPage.ctx, trip.profileSnapshot.companyName, index + 1, pages.length);
  });
  return pages;
};

const renderExpensePages = (trip: Trip) => {
  const page = createPage();
  const { ctx } = page;
  const totals = calculateTotals(trip);
  const rule = trip.ruleSnapshot;
  drawTitle(ctx, "出張旅費 精算書");
  let y = 170;
  y = drawInfoTable(
    ctx,
    [
      ["提出日", today()],
      ["出張先", trip.destination],
      ["氏名", trip.profileSnapshot.name],
      ["役職", trip.profileSnapshot.title],
      ["用件", trip.purpose],
      ["出張期間", `${trip.startDate} - ${trip.endDate}`],
      ["出張区分", trip.category],
      ["適用旅費規程", rule ? `${rule.category} / ${rule.title}` : "-"],
    ],
    y,
    18,
    46,
  );
  y = drawSection(ctx, "交通費明細", y + 44);
  y = drawDataTable(
    ctx,
    ["日付", "種別", "区間", "便名", "金額"],
    trip.transports.map((item) => [item.date, item.type, `${item.from} - ${item.to}`, item.flightNo, yen(item.amount)]),
    [220, 145, 300, 150, contentWidth - 815],
    y,
    17,
  );
  drawText(ctx, `交通費小計 ${yen(totals.transport)}`, pageWidth - margin, y + 16, 24, "bold", "right");
  y += 70;
  y = drawSection(ctx, "宿泊費明細", y);
  y = drawDataTable(
    ctx,
    ["開始日", "終了日", "宿泊先", "泊数", "金額"],
    trip.lodgings.map((item) => [item.startDate, item.endDate, item.place, `${lodgingNights(item)}泊`, yen(item.amount)]),
    [210, 210, 255, 100, contentWidth - 775],
    y,
    17,
  );
  drawText(ctx, `宿泊費小計 ${yen(totals.lodging)}`, pageWidth - margin, y + 16, 24, "bold", "right");
  y += 72;
  y = drawInfoTable(
    ctx,
    [
      ["日当明細", `${yen(rule?.perDiem ?? 0)} × ${totals.tripDays}日`],
      ["日当小計", yen(totals.perDiem)],
      ["渡航支度金", yen(totals.preparation)],
      ["旅費総額", yen(totals.grand)],
    ],
    y,
    22,
  );
  const approvalHeight = 50;
  const approvalY = y + 12;
  const approvalBottom = pageHeight - 150;
  if (approvalY + approvalHeight <= approvalBottom) {
    drawStampBoxes(ctx, ["担当印", "上席印", "出納印"], approvalY, approvalHeight);
    drawFooter(ctx, trip.profileSnapshot.companyName, 1, 1);
    return [page];
  }

  const approvalPage = createPage();
  drawTitle(approvalPage.ctx, "出張旅費 精算書（承認欄）");
  let approvalPageY = 190;
  approvalPageY = drawInfoTable(
    approvalPage.ctx,
    [["氏名", trip.profileSnapshot.name], ["出張期間", `${trip.startDate} - ${trip.endDate}`], ["旅費総額", yen(totals.grand)]],
    approvalPageY,
    22,
  );
  drawStampBoxes(approvalPage.ctx, ["担当印", "上席印", "出納印"], approvalPageY + 48);
  drawFooter(ctx, trip.profileSnapshot.companyName, 1, 2);
  drawFooter(approvalPage.ctx, trip.profileSnapshot.companyName, 2, 2);
  return [page, approvalPage];
};

export const downloadReportPdf = (trip: Trip) =>
  canvasesToPdf(renderReportPages(trip), `${fileSafe(`出張報告書_${trip.startDate}_${trip.destination || "出張先"}`)}.pdf`);

export const downloadExpensePdf = (trip: Trip) =>
  canvasesToPdf(renderExpensePages(trip), `${fileSafe(`出張旅費精算書_${trip.startDate}_${trip.destination || "出張先"}`)}.pdf`);


const renderMonthlyExpenseCover = (trips: Trip[], month: string): DrawPage => {
  const page = createPage();
  const { ctx } = page;
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(year, monthNumber, 0).getDate();
  const total = trips.reduce((sum, trip) => {
    const t = calculateTotals(trip);
    return { transport: sum.transport + t.transport, lodging: sum.lodging + t.lodging,
      perDiem: sum.perDiem + t.perDiem, preparation: sum.preparation + t.preparation,
      grand: sum.grand + t.grand };
  }, { transport: 0, lodging: 0, perDiem: 0, preparation: 0, grand: 0 });
  const company = trips[0].profileSnapshot.companyName;
  ctx.fillStyle = "#18314d";
  ctx.fillRect(margin, 65, contentWidth, 5);
  drawText(ctx, company, margin, 88, 22, "bold");
  drawText(ctx, "出張旅費 精算書（月次合計表）", pageWidth / 2, 160, 40, "bold", "center");
  drawText(ctx, `${year}年${monthNumber}月分`, pageWidth / 2, 222, 27, "bold", "center");
  ctx.fillStyle = "#eaf2fa";
  ctx.fillRect(margin, 300, contentWidth, 118);
  drawText(ctx, "旅費総額", margin + 25, 337, 28, "bold");
  drawText(ctx, yen(total.grand), pageWidth - margin - 25, 322, 55, "bold", "right");
  drawText(ctx, "費目別合計", margin, 465, 26, "bold");
  const entries = [["交通費", total.transport], ["宿泊費", total.lodging],
    ["日当", total.perDiem], ["渡航支度金", total.preparation]] as const;
  entries.forEach(([name, amount], i) => {
    const x = margin + (i % 2) * contentWidth / 2;
    const y = 510 + Math.floor(i / 2) * 84;
    ctx.strokeStyle = "#a9b8c8";
    ctx.strokeRect(x, y, contentWidth / 2, 80);
    drawText(ctx, name, x + 14, y + 12, 20);
    drawText(ctx, yen(amount), x + contentWidth / 2 - 14, y + 39, 25, "bold", "right");
  });
  drawText(ctx, `出張一覧（${trips.length}件）`, margin, 713, 26, "bold");
  const startY = 760;
  const rowHeight = Math.min(54, 600 / (trips.length + 1));
  const font = rowHeight >= 40 ? 19 : rowHeight >= 28 ? 15 : 11;
  const widths = [55, 330, 260, contentWidth - 645];
  const drawRow = (cells: string[], index: number, header = false) => {
    const y = startY + index * rowHeight;
    ctx.fillStyle = header ? "#eaf2fa" : "#ffffff";
    ctx.fillRect(margin, y, contentWidth, rowHeight);
    ctx.strokeStyle = "#b5c2d0";
    ctx.strokeRect(margin, y, contentWidth, rowHeight);
    let x = margin;
    cells.forEach((value, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 5, y + 1, widths[i] - 10, rowHeight - 2);
      ctx.clip();
      drawText(ctx, value, i === 3 ? x + widths[i] - 9 : x + 9,
        y + Math.max(3, (rowHeight - font) / 2), font, header ? "bold" : "normal",
        i === 3 ? "right" : "left");
      ctx.restore();
      x += widths[i];
    });
  };
  drawRow(["No.", "出張期間", "出張先", "旅費合計"], 0, true);
  trips.forEach((trip, index) => drawRow([String(index + 1),
    `${trip.startDate} ～ ${trip.endDate}`, trip.destination || "未入力",
    yen(calculateTotals(trip).grand)], index + 1));
  drawText(ctx, `合計 ${trips.length}件　${yen(total.grand)}`, pageWidth - margin,
    startY + (trips.length + 1) * rowHeight + 15, 22, "bold", "right");
  drawText(ctx, "添付：各出張の旅費精算書", margin, 1515, 20);
  drawText(ctx, `提出日：${year}年${monthNumber}月${monthEnd}日`,
    pageWidth - margin, 1515, 20, "normal", "right");
  drawStampBoxes(ctx, ["上席確認", "最終確認"], 1555, 60);
  drawFooter(ctx, company, 1, 1);
  return page;
};

export type MonthlyPdfKind = "report" | "expense";

export const downloadMonthlyPdf = (trips: Trip[], month: string, kind: MonthlyPdfKind) => {
  const orderedTrips = trips
    .filter((trip) => trip.startDate.slice(0, 7) === month)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt));
  if (!orderedTrips.length) throw new Error("この月の出張データはありません。");

  const label = kind === "report" ? "出張報告書" : "出張旅費精算書";
  const filename = `${fileSafe(`${month}_${label}_一括`)}.pdf`;
  return saveMonthlyPdf(() => {
    // Encode each trip before drawing the next to limit mobile canvas memory.
    const images: string[] = [];
    if (kind === "expense") {
      const { canvas } = renderMonthlyExpenseCover(orderedTrips, month);
      images.push(canvas.toDataURL("image/jpeg", 0.94));
      canvas.width = 0;
      canvas.height = 0;
    }
    for (const trip of orderedTrips) {
      const pages = kind === "report" ? renderReportPages(trip) : renderExpensePages(trip);
      for (const { canvas } of pages) {
        images.push(canvas.toDataURL("image/jpeg", 0.94));
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return buildPdf(images);
  }, filename, downloadBlob);
};
