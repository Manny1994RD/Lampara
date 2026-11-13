# Lámpara voice service: Supertonic 3 text-to-speech (English, Spanish, Korean) on the CPU.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN pip install supertonic==1.3.1 soundfile numpy

# Download the Supertonic 3 model (~400 MB) into the image, so the service starts quickly and works offline.
RUN python -c "from supertonic import TTS; TTS()"

WORKDIR /app
COPY app.py .

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)" || exit 1
CMD ["python", "app.py"]
