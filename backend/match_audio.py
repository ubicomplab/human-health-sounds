"""
    Given a user-inputted image, returns the top N most similar audio files in
    our collection along with analysis metrics.

    This consists of the following steps:

    1. Pre-Process Audio (trim, high energy, cap to 1s)
    2. Use HeAR Model to create embedding
    3. Find top N neighbors in embeddings. Gets the indices of top N in grid
    4. Analyze similarity, type confidence, and grid spread.
    5. Return results as a structured JSON response.
"""

# Import Statements
import librosa
import numpy as np
import soundfile as sf
import io
import keras
import pandas as pd
import random
from scipy.spatial import distance
import ffmpeg
import os
import logging
import json

# Import absl flags and logging utility
from absl import logging as absl_logging

# Set the absl logging level to suppress WARNINGs and below
absl_logging.set_verbosity(absl_logging.ERROR)

# Suppress TensorFlow/XLA (C++ Core) Informational Messages
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

SAMPLE_RATE = 16000
CLIP_DURATION = 2.0
CLIP_LENGTH = int(SAMPLE_RATE * CLIP_DURATION)  # 32000 samples
N = 10

def preload_resources(
    model_path="models--google--hear/snapshots/9b2eb2853c426676255cc6ac5804b7f1fe8e563f",
    embeddings_path="vocalsound_processed_hear_embeddings.npy",
    metadata_path="vocalsound_processed_hear_metadata.csv",
    grid_map_path="filename_to_grid_wav.json"
):
    """
    Loads ALL heavy resources ONCE at startup.
    Returns a dict storing everything.
    """

    hear_layer = load_hear_model('models--google--hear/snapshots/9b2eb2853c426676255cc6ac5804b7f1fe8e563f')
    embeddings, metadata_df = load_embeddings('vocalsound_processed_hear_embeddings.npy', 'vocalsound_processed_hear_metadata.csv')
    grid_map = load_grid_map('filename_to_grid_wav.json')

    return {
        "hear_layer": hear_layer,
        "embeddings": embeddings,
        "metadata_df": metadata_df,
        "grid_map": grid_map,
    }

def load_grid_map(grid_map_path='filename_to_grid_wav.json'):
    """Loads the filename-to-grid coordinate mapping from a JSON file."""
    try:
        with open(grid_map_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Grid map file not found at {grid_map_path}")
        return {}

def calculate_cohesion_metrics(query_embedding, neighbor_embeddings):
    """
    Calculates the spread of the neighbor vectors and the query's distance
    to the centroid of the neighbor cluster.

    Args:
        query_embedding (np.ndarray): The user's 512-dim embedding vector.
        neighbor_embeddings (list of np.ndarray): The 512-dim embedding vectors
                                                  of the top N neighbors.

    Returns:
        tuple: (vector_cohesion, query_to_centroid_distance)
    """
    neighbor_embeddings_array = np.array(neighbor_embeddings)

    if neighbor_embeddings_array.ndim == 1:
        # Only one neighbor (shouldn't happen with N=10, but good for safety)
        return 0.0, 0.0

    # 1. Calculate the Centroid (Mean Vector)
    centroid = np.mean(neighbor_embeddings_array, axis=0)

    # 2. Calculate Cohesion (Spread of the cluster)
    # Euclidean distance of each neighbor from the centroid
    distances_from_centroid = np.linalg.norm(neighbor_embeddings_array - centroid, axis=1)

    # Cohesion is the standard deviation of these distances
    vector_cohesion = np.std(distances_from_centroid)

    # 3. Calculate Query-to-Centroid Distance
    # Euclidean distance of the query from the centroid
    query_to_centroid_distance = np.linalg.norm(query_embedding - centroid)

    return vector_cohesion, query_to_centroid_distance

def get_grid_spread_and_center(top_N_neighbors_data):
    """Calculates the spread and proposed center of the top N grid coordinates."""

    # 1. Extract and convert coordinates to integers
    coords = []
    for neighbor in top_N_neighbors_data:
        x_str, y_str = neighbor['grid'].split('_')
        coords.append((int(x_str), int(y_str)))

    if not coords:
        return 0.0, 0.0, 0.0, 0.0 # Spread, Avg_X, Avg_Y, Median_X, Median_Y

    coords_array = np.array(coords)
    x_coords = coords_array[:, 0]
    y_coords = coords_array[:, 1]

    # 2. Measure of Spread (Euclidean distance standard deviation from the mean)

    # Center Point (Mean)
    mean_x = np.mean(x_coords)
    mean_y = np.mean(y_coords)

    # Calculate Euclidean distance of each point from the mean center
    distances_from_mean = np.sqrt((x_coords - mean_x)**2 + (y_coords - mean_y)**2)

    # Spread is the standard deviation of these distances
    spread = np.std(distances_from_mean)

    # 3. Median Center for display (more robust to outliers)
    median_x = np.median(x_coords)
    median_y = np.median(y_coords)

    return spread, mean_x, mean_y, median_x, median_y

def analyze_audio(audio_bytes, state):
    """
    Given user audio bytes, finds similar entries, calculates metrics,
    and returns a structured JSON response.
    """

    hear_layer = state["hear_layer"]
    embeddings = state["embeddings"]
    metadata_df = state["metadata_df"]
    grid_map = state["grid_map"]

    # Base JSON structure for failure
    response_data = {
        "status": "failure",
        "message": "Processing failed.",
        "grid_x_median": None,
        "grid_y_median": None,
        "top_neighbors": [],
        "analysis_metrics": {},
        "spectrogram_url": "/user_spectrograms/temp.png" # Placeholder
    }

    try:
        trimmed_audio, msg = trim_with_librosa_bytes(audio_bytes)

        if trimmed_audio is None:
            response_data["message"] = f"Audio failed pre-processing: {msg}"
            return response_data

        embedding = create_hear_embedding(trimmed_audio, SAMPLE_RATE, hear_layer)
        top_N_similar = top_N_neighbors(embedding, embeddings)

        # --- 1. Compile Top N Neighbors Data ---
        top_neighbors_data = []
        similarity_scores = []
        sound_types = []
        neighbor_embeddings = [] # <--- NEW: To store the actual neighbor vectors

        for index, similarity in top_N_similar.items():
            file_name_with_ext = metadata_df.iloc[index]['file_name']
            file_name = file_name_with_ext.replace('.wav', '')

            sound_type = metadata_df.iloc[index]['sound_type']

            grid_coord = grid_map.get(file_name, "N/A_N/A")

            neighbor_data = {
                "file_name": file_name,
                "similarity": float(round(similarity, 4)), # Truncate to 4 decimal points
                "grid": grid_coord,
                "sound_type": sound_type,
            }
            top_neighbors_data.append(neighbor_data)
            similarity_scores.append(similarity)
            sound_types.append(sound_type)
            neighbor_embeddings.append(embeddings[index]) # <--- NEW: Add the vector

        # --- 2. Calculate Analysis Metrics ---

        # Calculate Average Similarity
        avg_similarity = np.mean(similarity_scores)

        # Calculate Type Confidence (Count of the most common type)
        from collections import Counter
        type_counts = Counter(sound_types)
        most_common_type, most_common_count = type_counts.most_common(1)[0]
        type_confidence = most_common_count / N

        # Calculate Grid Spread and Center (Still useful for visualization)
        grid_spread, mean_x, mean_y, median_x, median_y = get_grid_spread_and_center(top_neighbors_data)

        # Calculate Vector Cohesion Metrics <--- NEW
        vector_cohesion, query_to_centroid_distance = calculate_cohesion_metrics(embedding, neighbor_embeddings)


        # --- 3. Final Response Assembly ---
        response_data["status"] = "ok"
        response_data["message"] = "Success"
        # Ensure median_x and median_y are native floats before rounding
        response_data["grid_x_median"] = float(round(median_x, 2))
        response_data["grid_y_median"] = float(round(median_y, 2))
        response_data["top_neighbors"] = top_neighbors_data
        response_data["analysis_metrics"] = {
            # Ensure all calculated metrics are explicitly cast to float/int
            "avg_similarity": float(round(avg_similarity, 4)),
            "type_confidence": float(round(type_confidence, 2)),
            "most_common_type": most_common_type, # str is fine
            "grid_spread": float(round(grid_spread, 2)),
            "vector_cohesion": float(round(vector_cohesion, 4)),
            "query_to_centroid_distance": float(round(query_to_centroid_distance, 4)),
            "num_processed_files": int(len(embeddings)) # Use int() for counts
        }

        # --- 4. Debug/Print Statements for Backend ---
        print("\n--- Audio Analysis Metrics ---")
        print(f"User Audio Status: {msg}")
        print(f"Top {N} Avg. Similarity Score: {response_data['analysis_metrics']['avg_similarity']:.4f}")
        print(f"Type Confidence: {response_data['analysis_metrics']['type_confidence']:.2f} ({most_common_count} of {N} are '{most_common_type}')")
        print(f"Grid Spread (2D Std Dev): {response_data['analysis_metrics']['grid_spread']:.2f}")
        print(f"Vector Cohesion (512D Std Dev): {response_data['analysis_metrics']['vector_cohesion']:.4f}")
        print(f"Query-to-Centroid Distance: {response_data['analysis_metrics']['query_to_centroid_distance']:.4f}")
        print(f"Proposed Grid Center (Median X, Y): ({response_data['grid_x_median']:.1f}, {response_data['grid_y_median']:.1f})")
        print("\nTop Neighbors:")
        for neighbor in top_neighbors_data:
            print(f"  - {neighbor['file_name']} | Sim: {neighbor['similarity']:.4f} | Grid: {neighbor['grid']} | Type: {neighbor['sound_type']}")

        return response_data

    except Exception as e:
        # ... (error handling) ...
        response_data["status"] = "failure"
        response_data["message"] = f"Critical error during analysis: {e}"
        print(f"CRITICAL ERROR: {e}")
        return response_data

def decode_webm_to_wav_bytes(webm_bytes):
    """Decode WebM/Opus blob → raw WAV PCM bytes."""
    try:
        out, _ = (
            ffmpeg
            .input('pipe:0')
            .output('pipe:1', format='wav', ac=1, ar=16000)
            .run(input=webm_bytes, capture_stdout=True, capture_stderr=True)
        )
        return out
    except Exception as e:
        print("FFmpeg decode error:", e)
        return None

def trim_with_librosa_bytes(
    audio_bytes,
    max_duration=1.0,
    top_db_threshold=40,
    min_duration=0.2,
    rms_threshold=-50
):
    """
    Accepts: audio_bytes from frontend (e.g., audio/webm or wav blob)
    Returns:
        trimmed_audio (np.ndarray or None)
        sr (int)
        message (str)
    """

    # First decode webm -> wav bytes
    wav_bytes = decode_webm_to_wav_bytes(audio_bytes)
    if wav_bytes is None:
        return None, "FFmpeg decode failed"

    # 1. Decode audio from bytes into waveform
    # try:
    #     audio, sr = sf.read(io.BytesIO(wav_bytes))
    #     if audio.ndim > 1:
    #         audio = librosa.to_mono(audio.T)
    # except:
    #     # fallback if soundfile cannot decode (e.g. webm)
    audio, sr = librosa.load(io.BytesIO(wav_bytes), sr=SAMPLE_RATE, mono=True)

    # Ensure consistent sample rate
    if sr != SAMPLE_RATE:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
        sr = SAMPLE_RATE

    original_duration = len(audio) / sr

    # Too short immediately
    if original_duration < min_duration:
        return None, f"Audio too short ({original_duration:.2f}s)"

    # 2. Silence Filtering (RMS check)
    mean_squared_amplitude = np.mean(audio**2)

    if mean_squared_amplitude == 0:
        rms_loudness = rms_threshold - 10
    else:
        rms_loudness = round(20 * np.log10(np.sqrt(mean_squared_amplitude)))

    if rms_loudness < rms_threshold:
        return None, f"Clip too quiet (RMS {rms_loudness} dB)"

    # 3. Trim leading/trailing silence
    core_segment, _ = librosa.effects.trim(audio, top_db=top_db_threshold)
    core_duration = len(core_segment) / sr

    # 4. Dynamic Trimming Logic if longer than max_duration
    if core_duration > max_duration:

        max_samples = int(max_duration * sr)
        hop_length = int(0.05 * sr)  # 50ms hop

        core_rms = librosa.feature.rms(
            y=core_segment,
            frame_length=2048,
            hop_length=hop_length,
            center=False
        )[0]

        best_start = 0
        max_energy_sum = -1

        for i in range(len(core_rms)):
            start_sample = librosa.frames_to_samples(i, hop_length=hop_length)
            if start_sample + max_samples > len(core_segment):
                break

            segment = core_segment[start_sample:start_sample + max_samples]
            energy_sum = np.sum(segment**2)

            if energy_sum > max_energy_sum:
                max_energy_sum = energy_sum
                best_start = start_sample

        final_trimmed = core_segment[best_start:best_start + max_samples]
        msg = f"Trimmed: core {core_duration:.3f}s → {max_duration}s max"
    else:
        final_trimmed = core_segment
        msg = f"Kept natural duration {core_duration:.3f}s"

    # 5. Normalize audio
    max_abs = np.max(np.abs(final_trimmed))
    if max_abs > 0:
        final_trimmed = final_trimmed / max_abs * 0.95

    return final_trimmed.astype(np.float32), msg

def load_hear_model(model_path=None):
    """
    Loads the HeAR TFSMLayer model once and returns it.
    """
    if model_path is None:
        model_path = "models--google--hear/snapshots/9b2eb2853c426676255cc6ac5804b7f1fe8e563f"

    hear_layer = keras.layers.TFSMLayer(model_path, call_endpoint="serving_default")
    return hear_layer


def create_hear_embedding(trimmed_audio, sr, hear_layer):
    """
    Accepts a trimmed mono audio waveform (float32 numpy array)
    and returns a single HeAR embedding vector.
    """

    if trimmed_audio is None:
        raise ValueError("trimmed_audio is None — cannot embed.")

    # Resample if somehow not at 16k
    if sr != SAMPLE_RATE:
        trimmed_audio = librosa.resample(trimmed_audio, orig_sr=sr, target_sr=SAMPLE_RATE)

    # Pad to exactly 2 seconds
    clip = np.pad(trimmed_audio, (0, CLIP_LENGTH - len(trimmed_audio)), 'constant')
    clip_batch = [clip]

    clip_batch = np.asarray(clip_batch)
    embedding_batch = hear_layer(clip_batch)['output_0'].numpy() # shape (1, 512)

    return embedding_batch[0]  # return shape (512,)

def load_embeddings(embeddings_path=None, metadata_path=None):
    """
    Loads the embeddings and metadata file
    """
    if embeddings_path is None:
        embeddings_path = 'vocalsound_processed_hear_embeddings.npy'
    if metadata_path is None:
        metadata_path ='vocalsound_processed_hear_metadata.csv'

    embeddings = np.load(embeddings_path) # Loads (20662, 1, 512)
    embeddings = np.squeeze(embeddings, axis=1) # Removes the middle dimension

    metadata_df = pd.read_csv(metadata_path)

    # Sanity Check: Ensure the number of embeddings matches the number of metadata rows
    if embeddings.shape[0] != metadata_df.shape[0]:
        print(f"WARNING: Mismatch between embeddings ({embeddings.shape[0]}) and metadata ({metadata_df.shape[0]}) rows.")

    return embeddings, metadata_df

def top_N_neighbors(embedding, embeddings):
  similarities = {}

  for i in range(len(embeddings)):
      current_embedding = embeddings[i]
      similarities[i] = 1 - distance.cosine(embedding, current_embedding)

  # Find the top N most similar entries
  top_N_similar = dict(sorted(similarities.items(), key=lambda item: item[1], reverse=True)[:N])
  return top_N_similar

# Test!!
def test_random():
    embeddings, metadata_df = load_embeddings()
    num_processed = len(embeddings)
    query_index = random.randint(0, num_processed)
    query_file = metadata_df.iloc[query_index]['file_name']

    path = f'vs_release_16k/audio_16k/{query_file}.wav'

    print(f"--- 🧪 Testing with Random File: **{query_file}** (Index: {query_index}) ---")

    try:
        # Load audio using soundfile
        audio_data, sr = sf.read(path)

        # Ensure it's mono (if not already)
        if audio_data.ndim > 1:
            audio_data = librosa.to_mono(audio_data.T)

        #  Convert the NumPy array audio to WAV-formatted bytes
        # The analyze_audio function expects the audio as a byte string/object.

        buffer = io.BytesIO()
        sf.write(buffer, audio_data, sr, format='WAV')
        audio_bytes = buffer.getvalue()

        analyze_audio(audio_bytes)

    except FileNotFoundError:
        print(f"Error: Audio file not found at path: {path}")
    except Exception as e:
        print(f"An error occurred during testing: {e}")

# test_random()