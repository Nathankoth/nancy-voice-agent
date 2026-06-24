# Builds the Nancy voice agent when Railway uses the monorepo root.
# Prefer setting Railway Root Directory to voice_agent/ instead if you can.
FROM python:3.12-slim

WORKDIR /app

COPY voice_agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY voice_agent/ .

ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
