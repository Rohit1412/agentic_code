from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters
from google.adk.tools.agent_tool import AgentTool
from .prompt import startup_analyst_prompt

import os
from dotenv import load_dotenv
load_dotenv()

from .data_analyst.agent import data_analyst_agent
from .risk_analyst.agent import risk_analyst_agent
from .product_and_tech_analyst.agent import product_and_tech_analyst

TARGET_FOLDER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "./")

# Define the first MCP toolset for Playwright
playwright_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command='npx',
            args=[
                "-y",
                "@playwright/mcp@latest",
                "--timeout-action",
                "300000",
                "--timeout-navigation",
                "300000",
            ],
        ),
        working_dir=TARGET_FOLDER_PATH,
        timeout=300,
    ),
    
)

# Define the second MCP toolset for sequential thinking
sequential_thinking_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command='npx',
            args=[
                "-y",
                "mcp-sequential-thinking@latest",
                "--timeout-action",
                "300000",
                "--timeout-navigation",
                "300000",
            ],
        ),
        working_dir=TARGET_FOLDER_PATH,
        timeout=300,
    ),
)


root_agent = LlmAgent(
    model='gemini-2.5-flash',
    name='startup_investor_agent',
    instruction=startup_analyst_prompt,
    tools=[
        playwright_toolset,
        AgentTool(agent=risk_analyst_agent),
        AgentTool(agent=data_analyst_agent),
        AgentTool(agent=product_and_tech_analyst),
    ],
)

