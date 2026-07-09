export const cleanData = (data) => {
    if (data === null || data === undefined) return null;
    if (Array.isArray(data)) {
        return data.map(item => cleanData(item)).filter(item => item !== undefined);
    }
    if (typeof data === 'object' && !(data instanceof Date)) {
        const cleaned = {};
        Object.keys(data).forEach(key => {
            const value = cleanData(data[key]);
            if (value !== undefined) {
                cleaned[key] = value;
            }
        });
        return cleaned;
    }
    if (typeof data === 'number' && Number.isNaN(data)) return 0;
    return data;
};
