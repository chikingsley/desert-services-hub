import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function test() {
  const response = await client.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 100,
    messages: [{ role: "user", content: "Hello" }],
  });
  console.log(response);
}

test();
