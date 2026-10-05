"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

export function QrCode({ value, label }: { value: string; label: string }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    QRCode.toDataURL(value, { width: 192, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (current) setImage(url);
      })
      .catch(() => {
        if (current) setImage(null);
      });

    return () => {
      current = false;
    };
  }, [value]);

  return image ? (
    <Image src={image} width={192} height={192} alt={label} unoptimized className="h-48 w-48 rounded-lg bg-white p-2" />
  ) : (
    <div className="grid h-48 w-48 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4 text-center text-xs text-[var(--muted)]">
      Generating QR code…
    </div>
  );
}
