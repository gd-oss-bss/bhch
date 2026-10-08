window.createGalleryThumbnail = async function(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 480 / bitmap.height, 640 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
        bitmap.close();
        throw new Error('Не удалось подготовить превью.');
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Не удалось создать превью.');
    return blob;
};
