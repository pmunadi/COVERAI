import { GoogleGenAI, Type } from "@google/genai";
import { DesignLayout, TextField, Orientation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateLayoutFromSummary(
  summary: string,
  orientation: Orientation,
  fontStyle: string
): Promise<DesignLayout & { generatedTexts: TextField[] }> {
  const prompt = `
    Act as a professional Copywriter and Graphic Designer. 
    Based on this content summary: "${summary}", create a catchy Title (Headline) and a compelling Subtitle.
    
    Then, provide a professional layout for these two elements for a ${orientation} canvas.
    
    Copywriting Rules:
    1. Title should be punchy, short, and attention-grabbing.
    2. Subtitle should provide context or a call to action.
    
    Layout Rules:
    1. Set x to 50 (center) as a starting point.
    2. Set y for Title around 40 and Subtitle around 55.
    3. Set align to "center".
    4. Width should be around 80%.
    5. Use ${fontStyle === 'serif' ? 'elegant serif' : 'modern sans-serif'} vibes.
    
    Return a JSON object with "generatedTexts" and "items".
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          generatedTexts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                content: { type: Type.STRING },
                style: { type: Type.STRING }
              },
              required: ["id", "content", "style"]
            }
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                align: { type: Type.STRING, enum: ["left", "center", "right"] },
                width: { type: Type.NUMBER },
                scale: { type: Type.NUMBER }
              },
              required: ["id", "x", "y", "align", "width", "scale"]
            }
          }
        },
        required: ["generatedTexts", "items"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return result;
  } catch (e) {
    console.error("Failed to parse layout JSON", e);
    throw new Error("Failed to generate content");
  }
}
