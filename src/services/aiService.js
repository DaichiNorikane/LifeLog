import { analyzeImageWithGemini } from '@/app/actions';
import { getMockResult } from '@/utils/mockData';

// Helper to resize image if it's too large (Vercel has 4.5MB limit)
const resizeImage = (file, maxWidth = 1024) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Compress to JPEG 0.7 to ensure small size
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};

export const analyzeImage = async (file) => {
    return new Promise(async (resolve) => {
        // 1. Resize/Compress file to base64 for API (Client-side)
        // This avoids Vercel's 4.5MB payload limit
        const base64Image = await resizeImage(file);

        // Simulate "Thinking" delay for UX consistent with "Gemini 3 Mode"
        setTimeout(async () => {
            try {
                // Attempt Real API
                const apiResult = await analyzeImageWithGemini(base64Image);

                if (apiResult && !apiResult.error) {
                    resolve({
                        ...apiResult,
                        confidence: 0.99,
                        isMock: false
                    });
                    return;
                }

                // Fallback to Smart Mock if no key or error
                console.warn("API unavailable, using Smart Mock:", apiResult?.error);
                const mock = getMockResult(file);
                // Propagate specific error if available
                resolve({ ...mock, isMock: true, error: apiResult?.error || "API unavailable" });

            } catch (e) {
                console.error("Analysis failed", e);
                // Extract error message "Too Many Requests" etc.
                const errorMsg = e.message.includes("429") ? "Quota Exceeded" : "API Error (Network/Size)";
                resolve({ ...getMockResult(file), isMock: true, error: errorMsg });
            }
        }, 3000); // 3s delay minimum for "Thinking" effect
    });
};
