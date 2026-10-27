/** Keep embedded document logos small without requiring staff to resize source images. */
export async function prepareLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('Choose a PNG or JPEG image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image up to 10 MB.');
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Image could not be read. Choose the file again.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error('Image could not be read. Choose a valid PNG or JPEG.');
  }
  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > 40_000_000
  )
    throw new Error('Choose an image with at most 40 million pixels.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable. Try another browser.');
  let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  for (;;) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL(file.type, 0.85);
    const encoded = value.split(',')[1];
    const bytes =
      (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    if (bytes <= 160 * 1024) return value;
    scale *= 0.75;
  }
}
