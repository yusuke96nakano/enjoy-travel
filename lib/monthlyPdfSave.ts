type PdfWritable = {
  write: (blob: Blob) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<PdfWritable> }>;
};

const isCancellation = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

/** Open native UI before rendering a large monthly PDF consumes user activation. */
export const saveMonthlyPdf = async (
  createPdf: () => Blob,
  filename: string,
  download: (blob: Blob, filename: string) => void,
) => {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const pickerWindow = window as SavePickerWindow;

  if (!isIOS && pickerWindow.showSaveFilePicker) {
    let handle;
    try {
      handle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      });
    } catch (error) {
      if (isCancellation(error)) return;
      // Unsupported contexts or denied picker access use a regular download.
      download(createPdf(), filename);
      return;
    }

    let writable: PdfWritable | undefined;
    try {
      const blob = createPdf();
      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      if (!isCancellation(error)) throw error;
    }
    return;
  }

  const blob = createPdf();
  if (isIOS && navigator.share) {
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData = { files: [file], title: filename };
    try {
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (isCancellation(error)) return;
    }
  }
  download(blob, filename);
};
