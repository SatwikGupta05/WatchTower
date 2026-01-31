"""
Video Stream Chunker with Webcam Support.

Supports:
- RTSP streams
- Local webcam (device index)
- Local video files
"""

import datetime
import logging
import os
import queue
import time
from typing import Optional, Union

import cv2

logger = logging.getLogger(__name__)

DEFAULT_FOURCC = cv2.VideoWriter_fourcc(*"avc1")


class VideoStreamChunker:
    """Chunks video streams into segments for processing.
    
    Supports multiple video sources:
    - RTSP URL (e.g., "rtsp://localhost:8554/stream")
    - Webcam device index (e.g., 0, 1, 2)
    - Local file path (e.g., "/path/to/video.mp4")
    """

    def __init__(
        self,
        stream_url: Union[str, int],
        output_dir: str,
        chunk_duration: int = 5,
        output_queue: Optional[queue.Queue] = None,
        source_type: str = "auto",  # "auto", "webcam", "rtsp", "file"
    ):
        """Initialize the video stream chunker.
        
        Args:
            stream_url: Video source - can be RTSP URL, webcam index (int), or file path.
            output_dir: Directory to save video chunks.
            chunk_duration: Duration of each chunk in seconds.
            output_queue: Queue to put completed chunk paths.
            source_type: Type of source - "auto" will detect automatically.
        """
        if chunk_duration <= 0:
            raise ValueError("Chunk duration must be positive")

        self.output_dir = output_dir
        self.chunk_duration = chunk_duration
        self.output_queue = output_queue
        self.is_running = False
        self.fourcc = DEFAULT_FOURCC

        # Determine source type and stream URL
        self.source_type = self._detect_source_type(stream_url, source_type)
        self.stream_url = self._normalize_stream_url(stream_url)

        logger.info(f"Video source type: {self.source_type}, URL/Index: {self.stream_url}")

        try:
            os.makedirs(output_dir, exist_ok=True)
            logger.info(f"Ensured output directory exists: {output_dir}")
        except OSError as e:
            logger.error(f"Failed to create output directory {output_dir}: {e}")
            raise

    def _detect_source_type(self, stream_url: Union[str, int], source_type: str) -> str:
        """Detect the type of video source."""
        if source_type != "auto":
            return source_type

        if isinstance(stream_url, int):
            return "webcam"
        
        stream_url_str = str(stream_url)
        
        # Check if it's a webcam index as string
        if stream_url_str.isdigit():
            return "webcam"
        
        # Check for webcam keyword
        if stream_url_str.lower().startswith("webcam"):
            return "webcam"
        
        # Check for RTSP
        if stream_url_str.lower().startswith("rtsp://"):
            return "rtsp"
        
        # Check for HTTP streams
        if stream_url_str.lower().startswith(("http://", "https://")):
            return "rtsp"  # Treat HTTP streams same as RTSP
        
        # Assume it's a file path
        if os.path.exists(stream_url_str):
            return "file"
        
        # Default to RTSP for unknown URLs
        return "rtsp"

    def _normalize_stream_url(self, stream_url: Union[str, int]) -> Union[str, int]:
        """Normalize the stream URL based on source type."""
        if self.source_type == "webcam":
            if isinstance(stream_url, int):
                return stream_url
            
            stream_url_str = str(stream_url)
            
            # Handle "webcam:0" or "webcam" format
            if stream_url_str.lower().startswith("webcam"):
                if ":" in stream_url_str:
                    try:
                        return int(stream_url_str.split(":")[1])
                    except ValueError:
                        return 0
                return 0
            
            # Handle numeric string
            if stream_url_str.isdigit():
                return int(stream_url_str)
            
            return 0  # Default to first webcam
        
        return stream_url

    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        """Open the video capture based on source type."""
        try:
            if self.source_type == "webcam":
                logger.info(f"Opening webcam device: {self.stream_url}")
                cap = cv2.VideoCapture(self.stream_url, cv2.CAP_DSHOW)  # Use DirectShow on Windows
                
                # Set webcam properties for better quality
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap.set(cv2.CAP_PROP_FPS, 30)
                
            else:
                logger.info(f"Opening stream: {self.stream_url}")
                cap = cv2.VideoCapture(self.stream_url)
            
            return cap
        except Exception as e:
            logger.error(f"Failed to create VideoCapture: {e}")
            return None

    def start(self):
        """Start the video stream chunker."""
        if self.is_running:
            logger.warning("Chunker is already running.")
            return
        self.is_running = True
        logger.info(f"Starting video stream chunker for {self.source_type}...")
        self.process_stream()
        logger.info("Video stream chunker stopped.")

    def stop(self):
        """Stop the video stream chunker."""
        logger.info("Stopping video stream chunker...")
        self.is_running = False

    def _finalize_chunk(
        self,
        writer: Optional[cv2.VideoWriter],
        current_file: Optional[str],
        start_time: Optional[datetime.datetime],
    ) -> None:
        """Finalize and rename a video chunk."""
        if writer and current_file and start_time:
            try:
                writer.release()
                end_time = datetime.datetime.now(datetime.timezone.utc)
                start_str = start_time.strftime("%Y%m%d%H%M%S")
                end_str = end_time.strftime("%Y%m%d%H%M%S")
                final_file = os.path.join(self.output_dir, f"{start_str}_{end_str}.mp4")
                os.rename(current_file, final_file)
                logger.info(f"Completed video chunk: {final_file}")
                if self.output_queue:
                    try:
                        self.output_queue.put(final_file)
                    except queue.Full:
                        logger.error("Output queue is full. Dropping chunk filename.")
                    except Exception as qe:
                        logger.error(f"Error putting chunk filename into queue: {qe}")
            except Exception as e:
                logger.error(f"Error finalizing video chunk {current_file}: {e}")

    def process_stream(self):
        """Process the video stream and create chunks."""
        cap = None
        writer = None
        chunk_start_time_monotonic = 0
        start_time_utc = None
        output_file = None
        frames_in_chunk = 0
        retry_delay = 1

        while self.is_running:
            try:
                if cap is None or not cap.isOpened():
                    cap = self._open_capture()
                    
                    if cap is None or not cap.isOpened():
                        logger.warning(
                            f"Failed to open {self.source_type} source. Retrying in {retry_delay} seconds..."
                        )
                        time.sleep(retry_delay)
                        retry_delay = min(retry_delay * 2, 60)
                        continue
                    
                    logger.info(f"Successfully opened {self.source_type} source")
                    retry_delay = 1
                    chunk_start_time_monotonic = 0
                    
                    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
                    logger.info(
                        f"Stream properties: FPS={fps}, Width={width}, Height={height}"
                    )

                ret, frame = cap.read()
                if not ret:
                    # For webcam, this might be a temporary issue
                    if self.source_type == "webcam":
                        logger.warning("Failed to read frame from webcam, retrying...")
                        time.sleep(0.1)
                        continue
                    
                    # For video files, finalize current chunk and stop (no loop)
                    if self.source_type == "file":
                        logger.info("Video file ended. Stopping chunker.")
                        if writer and frames_in_chunk > 0:
                            self._finalize_chunk(writer, output_file, start_time_utc)
                            writer = None
                            output_file = None
                            start_time_utc = None
                        
                        # Stop processing - don't loop
                        self.is_running = False
                        break
                    
                    logger.warning(
                        "Stream ended or frame read error. Releasing capture and attempting reconnect..."
                    )
                    if writer:
                        self._finalize_chunk(writer, output_file, start_time_utc)
                        writer = None
                        output_file = None
                        start_time_utc = None
                    if cap:
                        cap.release()
                        cap = None
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 60)
                    continue

                now_monotonic = time.monotonic()

                if (
                    chunk_start_time_monotonic == 0
                    or (now_monotonic - chunk_start_time_monotonic)
                    >= self.chunk_duration
                ):
                    if writer and frames_in_chunk > 0:
                        self._finalize_chunk(writer, output_file, start_time_utc)

                    chunk_start_time_monotonic = now_monotonic
                    start_time_utc = datetime.datetime.now(datetime.timezone.utc)
                    frames_in_chunk = 0
                    start_str = start_time_utc.strftime("%Y%m%d%H%M%S")

                    output_file = os.path.join(
                        self.output_dir, f"{start_str}_ongoing.mp4"
                    )
                    writer = cv2.VideoWriter(
                        output_file, self.fourcc, fps, (width, height)
                    )
                    if not writer.isOpened():
                        logger.error(f"Failed to open VideoWriter for {output_file}")
                        writer = None
                        time.sleep(1)
                        continue
                    logger.debug(f"Starting new chunk: {output_file}")

                if writer and writer.isOpened():
                    writer.write(frame)
                    frames_in_chunk += 1

            except cv2.error as e:
                logger.error(f"OpenCV error during stream processing: {e}")
                if writer:
                    writer.release()
                    writer = None
                if cap:
                    cap.release()
                    cap = None
                output_file = None
                start_time_utc = None
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 60)
            except Exception as e:
                logger.exception(f"Unexpected error in process_stream loop: {e}")
                if writer:
                    writer.release()
                    writer = None
                if cap:
                    cap.release()
                    cap = None
                output_file = None
                start_time_utc = None
                time.sleep(5)

        if writer and frames_in_chunk > 0:
            self._finalize_chunk(writer, output_file, start_time_utc)
        if cap:
            cap.release()
        logger.info("Stream processing loop finished.")
