# Use slim Python image
FROM python:3.10-slim

# Install system packages needed for librosa & ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && apt-get clean

# Set work directory
WORKDIR /app

# Copy requirements before copying the entire app (better caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your app
COPY . .

# Expose port (Cloud Run ignores this but good practice)
EXPOSE 8080

# Run your Flask app
CMD ["python", "app.py"]
