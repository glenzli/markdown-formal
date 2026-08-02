export async function copyReaderText(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch (_error) {
        const fallback = document.createElement('textarea');
        fallback.value = value;
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        return copied;
    }
}
