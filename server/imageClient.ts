import OpenAI from "openai";

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI 이미지 생성 기능을 사용하려면 .env에 OPENAI_API_KEY를 설정해주세요."
    );
  }
  return new OpenAI({ apiKey });
}

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024"
): Promise<Buffer> {
  const response = await getOpenAI().images.generate({
    model: "dall-e-3",
    prompt,
    size,
    response_format: "b64_json",
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}
