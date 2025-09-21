
from google.adk import Agent
from dotenv import load_dotenv
load_dotenv()
from google.adk.tools import google_search, url_context
from . import prompt

MODEL="gemini-2.5-flash"

product_and_tech_analyst = Agent(
    model=MODEL,
    name="product_and_tech_analyst",
    instruction=prompt.PRODUCT_AND_TECH_ANALYST_PROMPT,
    output_key="final_product_and_tech_output",
    tools=[google_search],
)