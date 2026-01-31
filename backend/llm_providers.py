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
    """Provider for OpenAI-compatible APIs (Llama, OpenAI, Grok)."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        provider_name: str = "openai-compatible",
    ):
        from openai import OpenAI

        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.provider_name = provider_name

        if not api_key:
            raise ValueError(f"API key must be provided for {provider_name}")

        try:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        except Exception as e:
            logger.error(f"Failed to initialize {provider_name} client: {e}")
            raise

    def get_provider_name(self) -> str:
        return self.provider_name

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

        # Build messages
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

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[system_message, user_message],
                response_format={
                    "type": "json_schema",
                    "json_schema": self._create_json_schema(),
                },
            )

            results_content = response.choices[0].message.content
            return json.loads(results_content)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON response: {e}")
            return {"error": "Failed to decode LLM response"}
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
            logger.debug(f"Raw response: {response_text if 'response_text' in dir() else 'N/A'}")
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
            return OpenAICompatibleProvider(
                api_key=api_key,
                base_url=base_url,
                model=model,
                provider_name=provider_name,
            )

    @classmethod
    def get_supported_providers(cls) -> List[str]:
        """Return list of supported provider names."""
        return list(cls.PROVIDER_CONFIGS.keys())

    @classmethod
    def get_provider_config(cls, provider_name: str) -> Dict[str, Any]:
        """Get default configuration for a provider."""
        return cls.PROVIDER_CONFIGS.get(provider_name.lower(), {})
