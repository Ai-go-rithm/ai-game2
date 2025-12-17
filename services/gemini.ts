import { GoogleGenAI } from "@google/genai";
import { Message } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateBotResponse = async (
  characterName: string,
  personality: string,
  history: Message[],
  userMessage: string
): Promise<string> => {
  try {
    const modelId = 'gemini-2.5-flash';
    
    // Construct a prompt that includes the persona
    const systemInstruction = `You are a 3D character named ${characterName}. ${personality} 
    Keep your responses concise (under 50 words) and in character. 
    You are currently talking to a user in a web browser.`;

    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 150, // Keep it short for chat bubbles
      }
    });

    return response.text || "...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I... I can't think right now.";
  }
};