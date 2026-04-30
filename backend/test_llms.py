import os
import asyncio
from dotenv import load_dotenv

# Load keys
load_dotenv(".env")

from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEndpoint
from langchain_core.messages import HumanMessage

async def test_openai():
    try:
        print("Testing OpenAI GPT-4o...")
        llm = ChatOpenAI(model="gpt-5.4", openai_api_key=os.getenv("OPENAI_API_KEY"))
        res = llm.invoke([HumanMessage(content="Hello! Reply with just the word 'OPENAI_OK'.")])
        print(f"✅ OpenAI Success: {res.content}")
    except Exception as e:
        print(f"❌ OpenAI Error: {e}")

async def test_anthropic():
    try:
        print("Testing Anthropic Claude 3 Haiku...")
        llm = ChatAnthropic(model_name="claude-opus-4-6", anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"), max_tokens=10)
        res = llm.invoke([HumanMessage(content="Hello! Reply with just the word 'CLAUDE_OK'.")])
        print(f"✅ Anthropic Success: {res.content}")
    except Exception as e:
        print(f"❌ Anthropic Error: {e}")

async def test_gemini():
    try:
        print("Testing Google Gemini...")
        llm = ChatGoogleGenerativeAI(model="models/gemini-3.0-flash", google_api_key=os.getenv("GEMINI_API_KEY"))
        res = llm.invoke([HumanMessage(content="Hello! Reply with just the word 'GEMINI_OK'.")])
        print(f"✅ Gemini Success: {res.content}")
    except Exception as e:
        print(f"❌ Gemini Error: {e}")

async def test_moonshot():
    try:
        print("Testing Moonshot Kimi K2.5 (Thinking Mode)...")
        import openai
        client = openai.OpenAI(
            api_key=os.getenv("MOONSHOT_API_KEY"),
            base_url="https://api.moonshot.ai/v1"
        )
        response = client.chat.completions.create(
            model="kimi-k2.5",
            messages=[
                {"role": "system", "content": "You are Kimi, an AI assistant created by Moonshot AI."},
                {"role": "user",   "content": "Reply with just the word 'KIMI_OK'."}
            ],
            temperature=1.0,
            stream=False
        )
        reasoning = response.choices[0].message.reasoning_content
        answer    = response.choices[0].message.content
        if reasoning:
            print(f"   [thinking]: {str(reasoning)[:80]}...")
        print(f"✅ Moonshot Success: {answer}")
    except Exception as e:
        print(f"❌ Moonshot Error: {e}")

async def test_hf():
    try:
        print("Testing Hugging Face (Llama-3.3-70B-Instruct via InferenceClient)...")
        from huggingface_hub import InferenceClient
        client = InferenceClient(
            model="meta-llama/Llama-3.3-70B-Instruct",
            token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),
            timeout=30
        )
        result = client.chat_completion(
            messages=[{"role": "user", "content": "Reply with just the word 'HF_OK'."}],
            max_tokens=10
        )
        print(f"✅ HF Success: {result.choices[0].message.content}")
    except Exception as e:
        print(f"❌ HF Error: {type(e).__name__}: {str(e)[:200]}")

async def main():
    print("--- Starting LLM API Key Tests ---")
    await test_openai()
    await test_anthropic()
    await test_gemini()
    await test_moonshot()
    await test_hf()
    print("--- Tests Complete ---")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
