import sys
import json

# if sys.prefix == sys.base_prefix:
#     print("NOT IN VIRTUAL ENV")
#     sys.exit()

from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import os
from match_audio import analyze_audio, preload_resources

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)  # This enables CORS for all routes

GLOBAL_STATE = preload_resources()

@app.route("/")
def hello_world():
    return '<p>hi there! It works!</p>'

@app.route("/get-grid-indices", methods=['POST', 'OPTIONS'])
@cross_origin()
def get_grid_indices():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
    # print("GOT IT")
    # return jsonify({}), 200
    print("Received!!")
    file = request.files["audio"]  # must match frontend
    audio_bytes = file.read()

    print(f"Received audio bytes size: {len(audio_bytes)} bytes")

    # analyze_audio returns only top N neighbors
    response_data = analyze_audio(audio_bytes, GLOBAL_STATE)
    return jsonify(response_data), 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)