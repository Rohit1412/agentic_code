
"""Risk Analysis Agent for providing the final risk evaluation"""

from google.adk import Agent
from dotenv import load_dotenv
load_dotenv()
from google.adk.tools import google_search, url_context
from . import prompt

MODEL="gemini-2.5-flash"

risk_analyst_agent = Agent(
    model=MODEL,
    name="risk_analyst_agent",
    instruction=prompt.RISK_ANALYST_PROMPT,
    output_key="final_risk_assessment_output",
    tools=[google_search],
)