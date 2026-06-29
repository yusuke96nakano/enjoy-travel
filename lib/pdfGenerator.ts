import { calculateTotals, lodgingNights, yen } from "./calc";
import { Trip } from "./types";

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

const drawInfoTable = (ctx: CanvasRenderingContext2D, rows: string[][], y: number, fontSize = 22) => {
  let currentY = y;
  for (const [label, value] of rows) {
    const valueLines = wrapLines(ctx, value || "-", contentWidth - labelWidth - 30, fontSize);
    const rowHeight = Math.max(60, valueLines.length * 34 + 24);
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

const drawStampBoxes = (ctx: CanvasRenderingContext2D, labels: string[], y: number) => {
  const width = contentWidth / labels.length;
  labels.forEach((label, index) => {
    const x = margin + width * index;
    ctx.strokeStyle = line;
    ctx.strokeRect(x, y, width, 92);
    drawText(ctx, label, x + width / 2, y + 24, 20, "normal", "center");
  });
  return y + 92;
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
  const shareData = { files: [file] };
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  downloadBlob(blob, filename);
};

const canvasesToPdf = (pages: DrawPage[], filename: string) => {
  const imageDataUrls = pages.map((page) => page.canvas.toDataURL("image/jpeg", 0.94));
  void shareOrDownloadPdf(buildPdf(imageDataUrls), filename);
};

export const downloadReportPdf = (trip: Trip) => {
  const page = createPage();
  const { ctx } = page;
  drawTitle(ctx, "出張報告書");
  let y = 176;
  y = drawInfoTable(ctx, [["氏名", trip.profileSnapshot.name], ["役職", trip.profileSnapshot.title]], y);
  y = drawSection(ctx, "報告概要", y + 54);
  y = drawInfoTable(ctx, [["出張期間", `${trip.startDate} - ${trip.endDate}`], ["出張地域", trip.destination], ["出張目的", trip.purpose]], y);
  y = drawSection(ctx, "報告事項", y + 54);
  y = drawWrapped(ctx, trip.reportText || "", margin, y, contentWidth, 21, 38);
  y += 48;
  drawStampBoxes(ctx, ["上席確認欄", "最終確認欄"], Math.min(y, pageHeight - 310));
  drawFooter(ctx, trip.profileSnapshot.companyName, 1, 1);
  canvasesToPdf([page], `${fileSafe(`出張報告書_${trip.startDate}_${trip.destination || "出張先"}`)}.pdf`);
};

export const downloadExpensePdf = (trip: Trip) => {
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
      ["適用旅費規程", rule ? `${rule.category} / ${rule.title} / 日当 ${yen(rule.perDiem)} / 宿泊 ${yen(rule.lodging)}` : "-"],
    ],
    y,
    20,
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
  y += 48;
  drawStampBoxes(ctx, ["担当印", "上席印", "出納印"], Math.min(y, pageHeight - 300));
  drawFooter(ctx, trip.profileSnapshot.companyName, 1, 1);
  canvasesToPdf([page], `${fileSafe(`出張旅費精算書_${trip.startDate}_${trip.destination || "出張先"}`)}.pdf`);
};
