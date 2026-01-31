# Sample Videos for Demo

Place your demo videos in this folder. Supported formats:
- `.mp4` (recommended)
- `.avi`
- `.mov`
- `.mkv`
- `.webm`

## Recommended Demo Videos

For danger detection demos, you can use:

1. **Weapon Detection**: Video showing someone holding a knife or similar object
2. **Physical Altercation**: Video showing pushing or fighting
3. **Suspicious Behavior**: Video showing someone acting suspiciously

## Tips for Good Demo Videos

- Keep videos **10-30 seconds** long
- Use **clear lighting** 
- Keep the camera **steady**
- Make the dangerous action **clearly visible**
- Resolution: 720p or 1080p works well

## Free Video Sources

You can find royalty-free sample videos at:
- [Pexels](https://www.pexels.com/videos/)
- [Pixabay](https://pixabay.com/videos/)
- [Videvo](https://www.videvo.net/)

## Usage

Once you place a video here, use the path in the configuration:
```
./sample_videos/your_video.mp4
```

Or upload via the API:
```bash
curl -X POST "http://localhost:8000/upload-video" \
  -F "file=@your_video.mp4"
```
