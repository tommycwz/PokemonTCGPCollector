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

EXPORT_SET_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\src\\assets\\cards\\sets.json"
EXPORT_CARD_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\src\\assets\\cards\\cards.json"
DETAILS_CACHE_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\cards\\tcgdx_cache.json"

# Foiled card IDs (A4B set)
FOILED_CARD_IDS = {
    'A4B-002', 'A4B-004', 'A4B-007', 'A4B-009', 'A4B-012', 'A4B-015', 'A4B-017', 'A4B-019',
    'A4B-021', 'A4B-026', 'A4B-028', 'A4B-031', 'A4B-033', 'A4B-035', 'A4B-037', 'A4B-039',
    'A4B-041', 'A4B-046', 'A4B-048', 'A4B-050', 'A4B-052', 'A4B-054', 'A4B-056', 'A4B-058',
    'A4B-062', 'A4B-065', 'A4B-070', 'A4B-072', 'A4B-074', 'A4B-077', 'A4B-079', 'A4B-081',
    'A4B-084', 'A4B-086', 'A4B-089', 'A4B-091', 'A4B-094', 'A4B-097', 'A4B-100', 'A4B-103',
    'A4B-105', 'A4B-109', 'A4B-111', 'A4B-113', 'A4B-115', 'A4B-117', 'A4B-119',
    'A4B-123', 'A4B-126', 'A4B-129', 'A4B-134', 'A4B-136', 'A4B-138', 'A4B-141',
    'A4B-144', 'A4B-147', 'A4B-150', 'A4B-152', 'A4B-154', 'A4B-157', 'A4B-162',
    'A4B-165', 'A4B-167', 'A4B-169', 'A4B-171', 'A4B-174', 'A4B-176', 'A4B-179',
    'A4B-181', 'A4B-183', 'A4B-186', 'A4B-188', 'A4B-190', 'A4B-192', 'A4B-195',
    'A4B-199', 'A4B-201', 'A4B-204', 'A4B-206', 'A4B-208', 'A4B-211', 'A4B-213',
    'A4B-217', 'A4B-219', 'A4B-221', 'A4B-225', 'A4B-227', 'A4B-229', 'A4B-231',
    'A4B-234', 'A4B-237', 'A4B-240', 'A4B-243', 'A4B-247', 'A4B-250', 'A4B-256',
    'A4B-258', 'A4B-261', 'A4B-263', 'A4B-265', 'A4B-268', 'A4B-270', 'A4B-273',
    'A4B-275', 'A4B-278', 'A4B-281', 'A4B-283', 'A4B-286', 'A4B-291', 'A4B-293',
    'A4B-295', 'A4B-298', 'A4B-301', 'A4B-303', 'A4B-305', 'A4B-307', 'A4B-309',
    'A4B-311', 'A4B-313', 'A4B-315', 'A4B-317', 'A4B-319', 'A4B-321', 'A4B-323',
    'A4B-325', 'A4B-327', 'A4B-329', 'A4B-331', 'A4B-333', 'A4B-335', 'A4B-337',
    'A4B-339', 'A4B-341', 'A4B-343', 'A4B-345', 'A4B-347', 'A4B-349', 'A4B-351',
    'A4B-353'
}

POCKETDB_SET_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/sets.json"
POCKETDB_CARD_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json"
TCGDX_SETS_URL = "https://api.tcgdex.net/v2/en/series/tcgp"
TCGDX_CARD_URL_TEMPLATE = "https://api.tcgdex.net/v2/en/cards/{card_id}"

REQUEST_TIMEOUT = (6, 30)
MAX_WORKERS_CARDS = 16  # Adjust based on your internet speed
ENABLE_TCGDX_ENRICHMENT = True  # Set False to skip enrichment for speed

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
# CACHE HANDLING
# ===============================================================

def load_cache():
    if os.path.exists(DETAILS_CACHE_PATH):
        with open(DETAILS_CACHE_PATH, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

def save_cache(cache):
    os.makedirs(os.path.dirname(DETAILS_CACHE_PATH), exist_ok=True)
    with open(DETAILS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

# ===============================================================
# FETCH FUNCTIONS
# ===============================================================

def fetch_card_details(card_id: str):
    url = TCGDX_CARD_URL_TEMPLATE.format(card_id=card_id.upper())
    try:
        return fetch_json(url)
    except Exception as e:
        print(f"  ⚠️ Failed to fetch {card_id}: {e}")
        return None

# ===============================================================
# MAIN GENERATORS
# ===============================================================

def generate_sets():
    print("[generate_sets] Fetching sets data...")
    try:
        pocketdb_data = fetch_json(POCKETDB_SET_URL)
        tcgdx_data = fetch_json(TCGDX_SETS_URL)

        pocketdb_lookup = {}
        for s in pocketdb_data:
            code = s.get("code", "").upper()
            if code.startswith("PROMO-"):
                code = code.replace("PROMO-", "P-")
            pocketdb_lookup[code] = s

        tcgdx_sets = tcgdx_data.get("sets", [])
        processed_sets = []

        for tcgdx_set in tcgdx_sets:
            code = tcgdx_set.get("id", "").upper()
            card_count = tcgdx_set.get("cardCount", {}).get("total", 0)
            series = extract_series(code)
            
            name = tcgdx_set.get("name", "Unknown")
            if name == "Promos-A":
                name = "Promo A"

            # shortName: take first char of each word in name, treat '-' as space
            short_name = ""
            if isinstance(name, str) and name:
                cleaned = name.replace('-', ' ').replace('and', ' ').replace('of', ' ')
                parts = [p for p in cleaned.split() if p]
                if parts:
                    short_name = ''.join(p[0] for p in parts).upper()

            processed_set = {
                "code": code,
                "name": name,
                "shortName": short_name,
                "series": series,
                "count": card_count,
                "releaseDate": None,
                "packs": []
            }

            if code in pocketdb_lookup:
                pocket_set = pocketdb_lookup[code]
                processed_set["releaseDate"] = pocket_set.get("releaseDate")
                processed_set["packs"] = pocket_set.get("packs", [])
                if not card_count:
                    processed_set["count"] = pocket_set.get("total", 0)

            processed_sets.append(processed_set)

        # Add missing PocketDB-only sets
        for code, pocket_set in pocketdb_lookup.items():
            if not any(s["code"] == code for s in processed_sets):
                series = extract_series(code)
                name = pocket_set.get("label", {}).get("en", "Unknown")

                # shortName: take first char of each word in name, treat '-' as space
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
                    "count": pocket_set.get("total", 0),
                    "releaseDate": pocket_set.get("releaseDate"),
                    "packs": pocket_set.get("packs", [])
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
        cache = load_cache()
        updated_cache = dict(cache)

        for i, card in enumerate(cards_data):
            if "rarityCode" in card:
                rarity_code = card.get("rarityCode", "")
                normalized_rarity = normalize_rarity(rarity_code)
                if normalized_rarity != card.get("rarity", ""):
                    card["rarity"] = normalized_rarity
                    rarity_updates += 1

            if "set" in card:
                if card["set"].startswith("PROMO-"):
                    card["set"] = card["set"].replace("PROMO-", "P-")
                    set_updates += 1

                series = extract_series(card["set"])
                number = card.get("number", 0)
                card_id = generate_card_id(card["set"], number)
                reordered = {
                    "series": series,
                    "set": card["set"],
                    "number": number,
                    "id": card_id
                }
                for k, v in card.items():
                    if k not in reordered:
                        reordered[k] = v
                
                # Add isFoiled attribute for matching A4B cards
                if card_id in FOILED_CARD_IDS:
                    reordered["isFoil"] = True
                
                cards_data[i] = reordered

        if ENABLE_TCGDX_ENRICHMENT:
            print(f"[generate_cards] Enriching with TCGDX ({MAX_WORKERS_CARDS} threads)...")
            card_tasks = [(card, card["id"]) for card in cards_data if card.get("id")]

            # First, apply existing cached data to all cards
            cached_applied = 0
            for card, card_id in card_tasks:
                if card_id in cache:
                    tcgdx_details = cache[card_id]
                    tcgdx_fields = ["types", "stage"]
                    for field in tcgdx_fields:
                        if field in tcgdx_details:
                            card[field] = tcgdx_details[field]
                    if tcgdx_details.get("category", "").lower() == "trainer":
                        trainer_type = tcgdx_details.get("trainerType", "").lower()
                        if trainer_type == "item":
                            card["types"] = ["Item"]
                        elif trainer_type == "supporter":
                            card["types"] = ["Supporter"]
                        elif trainer_type == "tool":
                            card["types"] = ["Tool"]
                        else:
                            card["types"] = ["Trainer"]
                    cached_applied += 1

            print(f"[generate_cards] Applied cached data to {cached_applied} cards")

            # Then, fetch missing cards
            missing_cards = [(card, card_id) for card, card_id in card_tasks if card_id not in cache]
            if missing_cards:
                print(f"[generate_cards] Fetching {len(missing_cards)} new cards...")
                with ThreadPoolExecutor(max_workers=MAX_WORKERS_CARDS) as executor:
                    future_to_card = {
                        executor.submit(fetch_card_details, card_id): (card, card_id)
                        for card, card_id in missing_cards
                    }

                    for i, future in enumerate(as_completed(future_to_card)):
                        card, card_id = future_to_card[future]
                        tcgdx_details = future.result()
                        if tcgdx_details:
                            updated_cache[card_id] = tcgdx_details
                            tcgdx_fields = ["types", "stage"]
                            for field in tcgdx_fields:
                                if field in tcgdx_details:
                                    card[field] = tcgdx_details[field]
                            if tcgdx_details.get("category", "").lower() == "trainer":
                                trainer_type = tcgdx_details.get("trainerType", "").lower()
                                if trainer_type == "item":
                                    card["types"] = ["Item"]
                                elif trainer_type == "supporter":
                                    card["types"] = ["Supporter"]
                                elif trainer_type == "tool":
                                    card["types"] = ["Tool"]
                                else:
                                    card["types"] = ["Trainer"]
                        if (i + 1) % 100 == 0:
                            print(f"  ...{i + 1}/{len(missing_cards)} new cards fetched")

            save_cache(updated_cache)
            print(f"[generate_cards] Cache updated with {len(updated_cache)} entries")

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
