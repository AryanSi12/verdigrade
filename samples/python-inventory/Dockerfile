FROM python:3.8-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY inventory ./inventory
CMD ["python", "-m", "flask", "--app", "inventory", "run", "--host", "0.0.0.0"]
