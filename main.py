import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from google.adk.cli.fast_api import get_fast_api_app

# Get the directory of the current script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Define the path to the agents directory
AGENTS_DIR = "."

# Create the FastAPI app using the ADK's function
# We set web=False because we are mounting the static files manually
app = get_fast_api_app(agents_dir=AGENTS_DIR, web=False)

# Define the path to the UI files
UI_DIR = os.path.join(BASE_DIR, "ui", "browser")

# Mount static files at /static to avoid conflicts with API routes
app.mount("/static", StaticFiles(directory=UI_DIR), name="static")

# Serve index.html at root
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(UI_DIR, "index.html"))

# Serve other static files like chat.js, favicon, etc.
@app.get("/{filename}")
async def serve_static_files(filename: str):
    file_path = os.path.join(UI_DIR, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # If file doesn't exist, serve index.html for SPA routing
    return FileResponse(os.path.join(UI_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
