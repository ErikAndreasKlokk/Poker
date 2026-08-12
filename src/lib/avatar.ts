/**
 * Crops an image to a centred square and re-encodes it small, in the browser.
 *
 * Doing this client-side keeps `sharp` (and its native build) out of the server
 * image entirely — the server only validates size and magic bytes.
 */
export async function resizeAvatar(file: File, size = 256): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	try {
		const side = Math.min(bitmap.width, bitmap.height);
		const sx = (bitmap.width - side) / 2;
		const sy = (bitmap.height - side) / 2;

		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas 2d context unavailable');
		ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', 0.85)
		);
		if (!blob) throw new Error('could not encode avatar');
		return blob;
	} finally {
		bitmap.close();
	}
}
