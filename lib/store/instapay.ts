export type InstaPayDetails = {
  instapay_link?: string | null;
  instapay_number?: string | null;
  transfer_instructions?: string | null;
};
export function validInstaPayLink(value: string): boolean {
  if (
    !value ||
    value.length > 2048 ||
    !/^https:\/\/ipn\.eg\//i.test(value) ||
    /[\s\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "ipn.eg" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname !== "/" &&
      url.toString().length <= 2048
    );
  } catch {
    return false;
  }
}
export function normalizeInstaPayNumber(value: string): string {
  const trimmed = value.trim();
  // Address characters identify the recipient; only phone formatting may be removed.
  if (trimmed.includes("@")) return trimmed;
  let digits = trimmed
    .replace(/[\u0660-\u0669]/g, (char) => String(char.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (char) => String(char.charCodeAt(0) - 0x06f0))
    .replace(/[\s()+-]/g, "");
  if (digits.startsWith("0020")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("20")) digits = "0" + digits.slice(2);
  return digits;
}
export function validInstaPayNumber(value: string): boolean {
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
  return (
    /^01[0125]\d{8}$/.test(value) ||
    /^[a-z0-9._-]{1,100}@instapay$/i.test(value)
  );
}
export function instaPayConfigured(value: InstaPayDetails): boolean {
  const link = value.instapay_link?.trim() ?? "",
    number = value.instapay_number?.trim() ?? "";
  return (
    (!link || validInstaPayLink(link)) &&
    (!number || validInstaPayNumber(number)) &&
    !!(link || number)
  );
}
export function instaPaySettings(value: InstaPayDetails) {
  const link = value.instapay_link?.trim() ?? "";
  const number = normalizeInstaPayNumber(value.instapay_number ?? "");
  if (link && !validInstaPayLink(link)) throw Error("INVALID_INSTAPAY_LINK");
  if (number && !validInstaPayNumber(number))
    throw Error("INVALID_INSTAPAY_NUMBER");
  return {
    instapay_link: link ? new URL(link).toString() : "",
    instapay_number: number,
  };
}
