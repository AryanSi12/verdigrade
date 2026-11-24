FROM python:3.8-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shortlink ./shortlink
CMD ["python", "-m", "flask", "--app", "shortlink", "run", "--host", "0.0.0.0"]
