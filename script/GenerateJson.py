import requests
import json
from datetime import datetime
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ===============================================================
# CONFIGURATION
# ===============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
EXPORT_SET_PATH = os.path.join(DATA_DIR, "sets.json")
EXPORT_CARD_PATH = os.path.join(DATA_DIR, "cards.json")

FOILED_IDS_PATH = os.path.join(BASE_DIR, "FoiledCards.txt")

# Foiled card IDs (A4B set)
def _load_foiled_ids(path: str) -> set:
    ids = set()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    t = line.strip()
                    if t and not t.startswith("#"):
                        ids.add(t.upper())
    except Exception as e:
        print(f"[foiled_ids] ⚠️ Failed to load foiled IDs from {path}: {e}")
    return ids

FOILED_CARD_IDS = _load_foiled_ids(FOILED_IDS_PATH)

POCKETDB_SET_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/sets.json"
POCKETDB_CARD_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.extra.json"

REQUEST_TIMEOUT = (6, 30)
MAX_WORKERS_CARDS = 16  # Adjust based on your internet speed

# ===============================================================
# GLOBAL THREAD SESSION
# ===============================================================

_thread_local = threading.local()

def _build_session() -> requests.Session:
    """Build a session with retry strategy and proper headers."""
    s = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=("GET",),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=64, pool_maxsize=64)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    s.headers.update({
        "User-Agent": "PokemonTCGPCollector/2.0 (+https://github.com/tommycwz)",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    })
    return s


def _get_session() -> requests.Session:
    sess = getattr(_thread_local, "session", None)
    if sess is None:
        sess = _build_session()
        _thread_local.session = sess
    return sess

# ===============================================================
# UTILITY FUNCTIONS
# ===============================================================

def fetch_json(url: str):
    sess = _get_session()
    resp = sess.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def extract_series(code: str) -> str:
    if code.startswith("P-"):
        return code[2:]
    else:
        return code[0] if code else ""

def generate_card_id(set_code: str, number: int) -> str:
    return f"{set_code}-{number:03d}"

def normalize_rarity(rarity_code: str) -> str:
    rarity_mapping = {
        "C": "◊", "U": "◊◊", "R": "◊◊◊", "RR": "◊◊◊◊",
        "AR": "☆", "SR": "☆☆", "SAR": "☆☆", "IM": "☆☆☆",
        "UR": "👑", "CR": "👑", "S": "✵", "SSR": "✵✵"
    }
    return rarity_mapping.get(rarity_code, rarity_code)

# ===============================================================
# FETCH FUNCTIONS
# ===============================================================

# ===============================================================
# MAIN GENERATORS
# ===============================================================

def generate_sets():
    print("[generate_sets] Fetching sets data...")
    try:
        pocketdb_data = fetch_json(POCKETDB_SET_URL)

        # PocketDB sets.json is a dict keyed by series (e.g., "A", "B") or a flat list
        iterable_sets = []
        if isinstance(pocketdb_data, dict):
            for arr in pocketdb_data.values():
                if isinstance(arr, list):
                    iterable_sets.extend(arr)
        elif isinstance(pocketdb_data, list):
            iterable_sets = pocketdb_data

        processed_sets = []
        for s in iterable_sets:
            if not isinstance(s, dict):
                continue
            code = str(s.get("code", "")).upper()
            if code.startswith("PROMO-"):
                code = code.replace("PROMO-", "P-")
            series = extract_series(code)

            # Name may be dict or string depending on source
            name_val = s.get("name")
            name = None
            if isinstance(name_val, dict):
                name = name_val.get("en")
            elif isinstance(name_val, str):
                name = name_val
            if not name:
                name = s.get("label", {}).get("en", "Unknown")

            short_name = ""
            if isinstance(name, str) and name:
                cleaned = name.replace('-', ' ').replace('and', ' ').replace('of', ' ')
                parts = [p for p in cleaned.split() if p]
                if parts:
                    short_name = ''.join(p[0] for p in parts).upper()

            processed_sets.append({
                "code": code,
                "name": name,
                "shortName": short_name,
                "series": series,
                "count": s.get("count", s.get("total", 0)),
                "releaseDate": s.get("releaseDate"),
                "packs": s.get("packs", [])
            })

        # Sort sets
        def sort_key(s):
            return (s["series"], s["code"].startswith("P-"), s["code"])

        processed_sets.sort(key=sort_key)

        os.makedirs(os.path.dirname(EXPORT_SET_PATH), exist_ok=True)
        with open(EXPORT_SET_PATH, "w", encoding="utf-8") as f:
            json.dump(processed_sets, f, ensure_ascii=False, indent=4)

        print(f"[generate_sets] ✅ Wrote {len(processed_sets)} sets to {EXPORT_SET_PATH}")
        return processed_sets

    except Exception as e:
        print(f"[generate_sets] ❌ Error: {e}")
        return []


def generate_cards():
    print("[generate_cards] Fetching cards data...")
    try:
        cards_data = fetch_json(POCKETDB_CARD_URL)
        print(f"[generate_cards] Processing {len(cards_data)} cards...")

        rarity_updates = set_updates = 0
        

        for i, card in enumerate(cards_data):

            if "set" in card:
                # Normalize set code: replace PROMO- with P- then uppercase
                set_code_raw = card["set"]
                if set_code_raw.startswith("PROMO-"):
                    set_code_raw = set_code_raw.replace("PROMO-", "P-")
                    set_updates += 1
                set_code_upper = str(set_code_raw).upper()

                series = extract_series(set_code_upper)
                number = card.get("number", 0)
                card_id_upper = generate_card_id(set_code_upper, number).upper()
                reordered = {
                    "series": series,
                    "set": set_code_upper,
                    "number": number,
                    "id": card_id_upper
                }
                for k, v in card.items():
                    if k not in reordered:
                        reordered[k] = v
                
                # Add isFoil attribute for matching A4B cards (uppercase id)
                if card_id_upper in FOILED_CARD_IDS:
                    reordered["isFoil"] = True

                # No external enrichment anymore; keep PocketDB-provided fields as-is

                cards_data[i] = reordered

        # No cache persistence needed

        os.makedirs(os.path.dirname(EXPORT_CARD_PATH), exist_ok=True)
        with open(EXPORT_CARD_PATH, "w", encoding="utf-8") as f:
            json.dump(cards_data, f, ensure_ascii=False, indent=2)

        print(f"[generate_cards] ✅ Wrote {len(cards_data)} cards to {EXPORT_CARD_PATH}")
        print(f"  Updated rarity={rarity_updates}, sets={set_updates}")
        return cards_data

    except Exception as e:
        print(f"[generate_cards] ❌ Error: {e}")
        return []

# ===============================================================
# MAIN
# ===============================================================

def main():
    start = datetime.now()
    print("=== Pokémon TCG Pocket Data Generation ===")

    generate_sets()
    generate_cards()

    print(f"✅ Completed in {datetime.now() - start}")

if __name__ == "__main__":
    main()
