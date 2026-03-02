"""
Multi-LLM Provider Support for Video Event Detection.

Supports:
- Llama API (Meta)
- OpenAI GPT-4o / GPT-4o-mini
- Google Gemini 1.5 Flash / Pro
- Grok Vision (xAI)
"""

import base64
import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def analyze_frames(
        self,
        frames: List[str],
        events: List[Dict[str, str]],
        context: str,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """Analyze video frames for event detection.

        Args:
            frames: List of base64 encoded frames (with data URI prefix).
            events: List of event dictionaries.
            context: Context description.
            system_prompt: System prompt template.
            user_prompt: User prompt template.

        Returns:
            Detection results with events analysis.
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        """Return the provider name."""
        pass


class OpenAICompatibleProvider(LLMProvider):
    """Provider for OpenAI-compatible APIs (Llama, OpenAI, Grok, Ollama, LM Studio)."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        provider_name: str = "openai-compatible",
        chat_endpoint: str = "chat/completions",
    ):
        from openai import OpenAI

        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.provider_name = provider_name
        self.chat_endpoint = chat_endpoint

        if not api_key:
            # Allow empty API key for local providers (Ollama, LM Studio)
            if provider_name in ("ollama", "lmstudio"):
                api_key = "dummy"
            else:
                raise ValueError(f"API key must be provided for {provider_name}")

        try:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        except Exception as e:
            logger.error(f"Failed to initialize {provider_name} client: {e}")
            raise

    def get_provider_name(self) -> str:
        return self.provider_name

    def _ensure_lmstudio_model_loaded(self, base_url: str) -> None:
        """Ensure the model is loaded in LM Studio before inference.
        
        LM Studio may fail with 'Operation canceled' if the model is not
        pre-loaded. This calls /api/v1/models/load and waits for it.
        """
        import httpx

        load_url = f"{base_url}/api/v1/models/load"
        try:
            logger.info(f"Pre-loading LM Studio model: {self.model}")
            with httpx.Client(timeout=300) as http_client:
                resp = http_client.post(load_url, json={
                    "model": self.model,
                    "context_length": 16384,  # Set large enough context for image tokens
                })
                if resp.status_code in (200, 201):
                    logger.info(f"LM Studio model '{self.model}' loaded successfully.")
                elif resp.status_code == 409:
                    # 409 means model is already loaded - that's fine
                    logger.info(f"LM Studio model '{self.model}' is already loaded.")
                else:
                    logger.warning(
                        f"LM Studio model load returned status {resp.status_code}: {resp.text}"
                    )
        except Exception as e:
            logger.warning(f"Could not pre-load LM Studio model (will try inference anyway): {e}")

    def _create_json_schema(self) -> Dict[str, Any]:
        """Create JSON schema for response validation."""
        return {
            "schema": {
                "type": "object",
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "event_code": {"type": "string"},
                                "detected": {"type": "boolean"},
                                "explanation": {"type": "string"},
                            },
                            "required": ["event_code", "detected", "explanation"],
                        },
                    }
                },
                "required": ["events"],
            }
        }

    def _normalize_response(self, parsed: Dict[str, Any], events: List[Dict[str, str]]) -> Dict[str, Any]:
        """Normalize LLM response to the expected events array format.

        Some models return flat key-value pairs like {"weapon-detected": true}
        instead of the expected {"events": [{"event_code": ..., "detected": ...}]}.
        This method converts both formats to the standard format.
        """
        # Already in correct format
        if "events" in parsed and isinstance(parsed["events"], list):
            return parsed

        # Flat format: {"weapon-detected": true, "fight": false, ...}
        event_codes = {e["event_code"] for e in events}
        normalized_events = []
        for key, value in parsed.items():
            if isinstance(value, bool):
                normalized_events.append({
                    "event_code": key,
                    "detected": value,
                    "explanation": f"Detected: {value}",
                })
            elif isinstance(value, dict) and "detected" in value:
                normalized_events.append({
                    "event_code": key,
                    "detected": bool(value["detected"]),
                    "explanation": value.get("explanation", value.get("reason", "")),
                })

        if normalized_events:
            logger.info(f"Normalized flat response to events array ({len(normalized_events)} events)")
            return {"events": normalized_events}

        logger.warning(f"Could not normalize response: {parsed}")
        return parsed

    def analyze_frames(
        self,
        frames: List[str],
        events: List[Dict[str, str]],
        context: str,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """Analyze frames using OpenAI-compatible API."""
        # Build event list string
        event_list_str = "\n".join(
            f"- {e['event_code']}: {e['event_description']} {e.get('detection_guidelines', '')}"
            for e in events
        )

        try:
            # Use custom endpoint if specified (for LM Studio native API)
            if self.chat_endpoint != "chat/completions":
                # LM Studio uses different format: "input" array instead of "messages"
                import httpx
                base = self.base_url.rstrip('/')
                full_url = f"{base}/{self.chat_endpoint}"

                # Pre-load the model via LM Studio's load endpoint before inference
                self._ensure_lmstudio_model_loaded(base)

                # Limit frames for local models - each image = ~1000 tokens
                # Keep max 2 frames to stay well within context and prevent OOM crashes
                MAX_FRAMES_LOCAL = 2
                if len(frames) > MAX_FRAMES_LOCAL:
                    # Evenly sample MAX_FRAMES_LOCAL frames from all available
                    step = len(frames) // MAX_FRAMES_LOCAL
                    frames = [frames[i * step] for i in range(MAX_FRAMES_LOCAL)]
                    logger.info(f"Reduced to {MAX_FRAMES_LOCAL} frames for local model to fit context window")

                # Build LM Studio format with "input" array
                # Include system prompt and STRICT JSON format instructions
                full_user_prompt = (
                    f"{system_prompt.format(context=context)}\n\n"
                    f"{user_prompt.format(events_list=event_list_str)}\n\n"
                    "IMPORTANT: You MUST respond ONLY with valid JSON in EXACTLY this format, no other text:\n"
                    '{"events": [{"event_code": "code", "detected": true, "explanation": "reason"}]}'
                )
                
                input_content = [
                    {"type": "text", "content": full_user_prompt}
                ]

                # Add frames as images in LM Studio format
                for frame in frames:
                    input_content.append({
                        "type": "image",
                        "data_url": frame  # LM Studio expects data_url, not nested in image_url
                    })

                # LM Studio request format - use large context_length to fit image tokens
                request_body = {
                    "model": self.model,
                    "input": input_content,
                    "context_length": 16384,
                    "temperature": 0.7,
                }

                # Use httpx with longer timeout since model loading can take time
                with httpx.Client(timeout=300) as http_client:
                    response = http_client.post(full_url, json=request_body)
                    response.raise_for_status()
                    result = response.json()
                    # LM Studio returns output[0].content, not choices[0].message.content
                    if "output" in result and len(result["output"]) > 0:
                        results_content = result["output"][0]["content"]
                    elif "choices" in result:
                        results_content = result["choices"][0]["message"]["content"]
                    else:
                        logger.error(f"Unexpected LM Studio response format: {result}")
                        return {"error": "Unexpected response format from LM Studio"}
            else:
                # Standard OpenAI format for other providers
                system_message = {
                    "role": "system",
                    "content": system_prompt.format(context=context),
                }

                content = [
                    {"type": "text", "text": user_prompt.format(events_list=event_list_str)}
                ]

                for frame in frames:
                    content.append({"type": "image_url", "image_url": {"url": frame}})

                user_message = {"role": "user", "content": content}

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[system_message, user_message],
                    response_format={
                        "type": "json_schema",
                        "json_schema": self._create_json_schema(),
                    },
                )
                results_content = response.choices[0].message.content

            parsed = json.loads(results_content)
            return self._normalize_response(parsed, events)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON response from {self.provider_name}: {e}")
            # Try to extract JSON from wrapped response
            try:
                if isinstance(results_content, str):
                    if "```json" in results_content:
                        results_content = results_content.split("```json")[1].split("```")[0]
                    elif "```" in results_content:
                        results_content = results_content.split("```")[1].split("```")[0]
                    parsed = json.loads(results_content.strip())
                    return self._normalize_response(parsed, events)
            except Exception:
                pass
            return {"error": f"Failed to decode LLM response: {e}"}
        except Exception as e:
            logger.error(f"Error calling {self.provider_name} API: {e}")
            return {"error": f"LLM API call failed: {e}"}


class GeminiProvider(LLMProvider):
    """Provider for Google Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-lite"):
        import google.generativeai as genai

        self.api_key = api_key
        self.model_name = model

        if not api_key:
            raise ValueError("API key must be provided for Gemini")

        try:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(model)
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
            raise

    def get_provider_name(self) -> str:
        return "gemini"

    def analyze_frames(
        self,
        frames: List[str],
        events: List[Dict[str, str]],
        context: str,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """Analyze frames using Google Gemini API."""
        import google.generativeai as genai
        from PIL import Image
        import io

        # Build event list string
        event_list_str = "\n".join(
            f"- {e['event_code']}: {e['event_description']} {e.get('detection_guidelines', '')}"
            for e in events
        )

        # Build the full prompt
        full_prompt = f"""
{system_prompt.format(context=context)}

{user_prompt.format(events_list=event_list_str)}

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{{
    "events": [
        {{
            "event_code": "event-code-here",
            "detected": true or false,
            "explanation": "Brief explanation of why event was or was not detected"
        }}
    ]
}}
"""

        # Convert base64 frames to PIL Images for Gemini
        images = []
        for frame in frames:
            try:
                # Remove data URI prefix if present
                if "," in frame:
                    base64_data = frame.split(",")[1]
                else:
                    base64_data = frame

                image_bytes = base64.b64decode(base64_data)
                image = Image.open(io.BytesIO(image_bytes))
                images.append(image)
            except Exception as e:
                logger.warning(f"Failed to decode frame: {e}")
                continue

        if not images:
            return {"error": "No valid frames to analyze"}

        try:
            # Create content list with prompt and images
            content = [full_prompt] + images

            response = self.model.generate_content(content)

            # Extract JSON from response
            response_text = response.text.strip()

            # Try to find JSON in the response
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            return json.loads(response_text.strip())

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode Gemini JSON response: {e}")
            logger.debug(
                f"Raw response: {response_text if 'response_text' in dir() else 'N/A'}"
            )
            return {"error": "Failed to decode LLM response"}
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return {"error": f"LLM API call failed: {e}"}


class LLMProviderFactory:
    """Factory for creating LLM providers."""

    PROVIDER_CONFIGS = {
        "llama": {
            "class": OpenAICompatibleProvider,
            "default_base_url": "https://api.llama.com/compat/v1/",
            "default_model": "Llama-4-Maverick-17B-128E-Instruct-FP8",
            "env_key": "LLAMA_API_KEY",
        },
        "openai": {
            "class": OpenAICompatibleProvider,
            "default_base_url": "https://api.openai.com/v1",
            "default_model": "gpt-4o-mini",
            "env_key": "OPENAI_API_KEY",
        },
        "grok": {
            "class": OpenAICompatibleProvider,
            "default_base_url": "https://api.x.ai/v1",
            "default_model": "grok-vision-beta",
            "env_key": "GROK_API_KEY",
        },
        "gemini": {
            "class": GeminiProvider,
            "default_model": "gemini-1.5-flash",
            "env_key": "GEMINI_API_KEY",
        },
        "ollama": {
            "class": OpenAICompatibleProvider,
            "default_base_url": "http://localhost:11434/v1",
            "default_model": "llava",
            "env_key": None,
            "local": True,
        },
        "lmstudio": {
            "class": OpenAICompatibleProvider,
            "default_base_url": "http://localhost:1234",
            "default_model": "qwen3-vl-8b-instruct-abliterated-v2.0",
            "env_key": None,
            "local": True,
            "chat_endpoint": "api/v1/chat",
        },
    }

    @classmethod
    def create_provider(
        cls,
        provider_name: str,
        api_key: str,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> LLMProvider:
        """Create an LLM provider instance.

        Args:
            provider_name: Name of the provider (llama, openai, gemini, grok).
            api_key: API key for the provider.
            model: Optional model override.
            base_url: Optional base URL override (for OpenAI-compatible providers).

        Returns:
            LLMProvider instance.

        Raises:
            ValueError: If provider is not supported.
        """
        provider_name = provider_name.lower()

        if provider_name not in cls.PROVIDER_CONFIGS:
            raise ValueError(
                f"Unsupported provider: {provider_name}. "
                f"Supported providers: {list(cls.PROVIDER_CONFIGS.keys())}"
            )

        config = cls.PROVIDER_CONFIGS[provider_name]
        provider_class = config["class"]
        model = model or config["default_model"]

        if provider_class == GeminiProvider:
            return GeminiProvider(api_key=api_key, model=model)
        else:
            base_url = base_url or config["default_base_url"]
            chat_endpoint = config.get("chat_endpoint", "chat/completions")
            return OpenAICompatibleProvider(
                api_key=api_key,
                base_url=base_url,
                model=model,
                provider_name=provider_name,
                chat_endpoint=chat_endpoint,
            )

    @classmethod
    def get_supported_providers(cls) -> List[str]:
        """Return list of supported provider names."""
        return list(cls.PROVIDER_CONFIGS.keys())

    @classmethod
    def get_provider_config(cls, provider_name: str) -> Dict[str, Any]:
        """Get default configuration for a provider."""
        return cls.PROVIDER_CONFIGS.get(provider_name.lower(), {})
