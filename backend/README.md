# Video Event Detection API

A FastAPI application for video event detection using multiple AI providers.

## Features

- **Multi-LLM Provider Support**: Llama, OpenAI GPT-4, Google Gemini, xAI Grok
- **Multiple Video Sources**: Webcam, RTSP streams, local video files
- **Pre-built Danger Detection**: Weapon detection, fighting, suspicious behavior, etc.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables (based on your chosen provider):
```bash
# For Gemini (recommended for free tier)
GEMINI_API_KEY=your_gemini_api_key

# For OpenAI
OPENAI_API_KEY=your_openai_api_key

# For Llama
LLAMA_API_KEY=your_llama_api_key

# For Grok
GROK_API_KEY=your_grok_api_key

# Database
DATABASE_URL=your_database_url_here
```

## Running the API

Start the server:
```bash
cd backend
python app.py
```

The server will start on http://0.0.0.0:8000

## API Endpoints

### Start Service
```
POST /start
```

Request body example (Webcam + Gemini):
```json
{
  "model": "gemini-1.5-flash",
  "base_url": "",
  "rtsp_url": "webcam:0",
  "chunk_duration": 5,
  "output_dir": "./video_chunks",
  "context": "Security camera footage. Monitor for dangerous activities.",
  "provider": "gemini",
  "source_type": "webcam",
  "events": [
    {
      "event_code": "weapon-detected",
      "event_description": "A person is holding a weapon such as a knife or dangerous object.",
      "detection_guidelines": "Look for any person holding sharp objects like knives, firearms, or blunt weapons."
    },
    {
      "event_code": "physical-altercation",
      "event_description": "Two or more people are engaged in a physical fight.",
      "detection_guidelines": "Detect pushing, hitting, wrestling, or any aggressive physical contact."
    }
  ]
}
```

Request body example (RTSP + Llama):
```json
{
  "model": "Llama-4-Maverick-17B-128E-Instruct-FP8",
  "base_url": "https://api.llama.com/compat/v1/",
  "rtsp_url": "rtsp://localhost:8554/hackathon",
  "chunk_duration": 5,
  "output_dir": "./video_chunks",
  "context": "Industrial camera showing a robotic arm.",
  "provider": "llama",
  "source_type": "rtsp",
  "events": [
    {
      "event_code": "robot-is-idle",
      "event_description": "The robotic arm hasn't moved.",
      "detection_guidelines": "Robot hasn't moved and green light is on."
    }
  ]
}
```

### Supported Providers
- `llama` - Meta Llama API
- `openai` - OpenAI GPT-4 Vision
- `gemini` - Google Gemini (Free tier: 15 req/min)
- `grok` - xAI Grok Vision

### Supported Source Types
- `file` - Local video file (perfect for demos!)
- `webcam` - Laptop webcam (use "webcam:0", "webcam:1", etc.)
- `rtsp` - RTSP stream URL
- `auto` - Auto-detect based on URL format

### Upload Sample Video
```
POST /upload-video
Content-Type: multipart/form-data

file: <video_file>
```

Response:
```json
{
  "status": "success",
  "filename": "danger_demo.mp4",
  "path": "./sample_videos/danger_demo.mp4",
  "message": "Video uploaded successfully. Use './sample_videos/danger_demo.mp4' as the video source."
}
```

### List Uploaded Videos
```
GET /list-videos
```

Response:
```json
{
  "videos": [
    {"filename": "danger_demo.mp4", "path": "./sample_videos/danger_demo.mp4", "size_mb": 2.5}
  ]
}
```

### Stop Service
```
POST /stop
```

### Get Status
```
GET /status
```

### Get Video
```
GET /video?filepath=/path/to/video.mp4
```

## Interactive Documentation

FastAPI provides interactive documentation at:
- http://0.0.0.0:8000/docs
- http://0.0.0.0:8000/redoc 