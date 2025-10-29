import requests
import json
from datetime import datetime
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

EXPORT_SET_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\sets.json"
EXPORT_CARD_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\cards.json"

TCGDEX_SETS_URL = "https://api.tcgdex.net/v2/en/series/tcgp"
POCKETDB_SET_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/sets.json"

# Endpoint templates (use these rather than hardcoding URLs inline)
TCGDEX_SET_URL_TEMPLATE = "https://api.tcgdex.net/v2/en/sets/{set_id}"
TCGDEX_CARD_URL_TEMPLATE = "https://api.tcgdex.net/v2/en/cards/{card_id}"

set_id_list = []
card_id_list = []  # Populated by generate_card_ids_from_sets()

# Performance and resilience settings
MAX_WORKERS_SETS = 8
MAX_WORKERS_CARDS = 16
REQUEST_TIMEOUT = (6, 30)  # (connect, read) seconds

# Optional cache for card ids to skip re-fetching sets repeatedly
CARD_ID_CACHE_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\card_ids.json"

_thread_local = threading.local()


def _build_session() -> requests.Session:
    s = requests.Session()
    # Retries for idempotent GET requests, handle 429/5xx with backoff
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
        "User-Agent": "PokemonTCGPCollector/1.0 (+https://github.com/tommycwz)",
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


def fetch_json(url: str):
    sess = _get_session()
    resp = sess.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _normalize_rarity_to_symbol(raw: str) -> str:
    """Convert textual rarity like 'Two Diamond' to symbol per mapping; else 'P'."""
    if not raw:
        return 'P'
    s = str(raw).strip().lower()
    # normalize plurals and whitespace
    s = ' '.join(s.replace('-', ' ').split())
    if s.endswith('s'):
        s = s[:-1]
    mapping = {
        'one diamond': '◊',
        'two diamond': '◊◊',
        'three diamond': '◊◊◊',
        'four diamond': '◊◊◊◊',
        'one star': '☆',
        'two star': '☆☆',
        'three star': '☆☆☆',
        'one shiny': '✵',
        'two shiny': '✵✵',
        'crown': '👑',
    }
    return mapping.get(s, 'P')


def _normalize_card_inplace(card: dict) -> None:
    """Apply requested normalizations to a single card object in-place."""
    # Uppercase card id
    cid = card.get('id')
    if cid is not None:
        try:
            card['id'] = str(cid).upper()
        except Exception:
            pass

    # Normalize rarity to symbol
    if 'rarity' in card:
        card['rarity'] = _normalize_rarity_to_symbol(card.get('rarity'))

    # Ensure image ends with /low.webp when image path has no extension
    img = card.get('image')
    if isinstance(img, str) and img:
        base = img.rstrip('/')
        if base.endswith('/low.webp'):
            card['image'] = base
        elif base.endswith('/high.webp'):
            card['image'] = base[:-9] + '/low.webp'  # replace trailing '/high.webp'
        elif base.endswith('.webp'):
            # Already a concrete image path; keep as-is
            card['image'] = base
        else:
            card['image'] = base + '/low.webp'

def generate_set():
    # Fetch both sources
    tcgdex_data = fetch_json(TCGDEX_SETS_URL)
    pocketdb_data = fetch_json(POCKETDB_SET_URL)

    tcgdex_sets = tcgdex_data.get("sets", [])
    pocketdb_sets = {s["code"]: s for s in pocketdb_data}

    combined = {}

    # Use TCGDEX as the main base
    for s in tcgdex_sets:
        code = s.get("id").upper()
        name = s.get("name")
        logo = s.get("logo") + ".webp" if s.get("logo") else None
        symbol = s.get("symbol") + ".webp" if s.get("symbol") else None
        count = s.get("cardCount", {}).get("total", 0)

        set_id_list.append(code.upper())

        if code.startswith("P"):
            code = code.replace("P", "PROMO", 1)

        combined[code] = {
            "code": code,
            "name": name,
            "count": count,
            "logo": logo,
            "symbol": symbol,
            "releaseDate": None,
            "packs": None,
        }

        # Merge with PocketDB if available
        if code in pocketdb_sets:
            pocket = pocketdb_sets[code]
            combined[code]["releaseDate"] = pocket.get("releaseDate")
            combined[code]["packs"] = pocket.get("packs")

    # Include missing sets that only exist in PocketDB
    for code, pocket in pocketdb_sets.items():
        if code not in combined:
            combined[code] = {
                "code": code.upper(),
                "name": pocket.get("label").get("en", "Unknown"),
                "count": pocket.get("total", 0),
                "logo": None,
                "symbol": None,
                "releaseDate": pocket.get("releaseDate"),
                "packs": pocket.get("packs"),
            }

            set_id_list.append(code.upper())

    # Convert to list
    output = list(combined.values())

    with open(EXPORT_SET_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=4)


def generate_card_ids_from_sets():
    global card_id_list

    if not set_id_list:
        print("[generate_card_ids_from_sets] set_id_list is empty. Run generate_set() first.")
        return

    # If cache exists, use it to save time
    if os.path.exists(CARD_ID_CACHE_PATH):
        try:
            with open(CARD_ID_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if isinstance(cached, list) and cached:
                card_id_list = cached
                print(f"[generate_card_ids_from_sets] Loaded {len(card_id_list)} card IDs from cache.")
                return
        except Exception as e:
            print(f"[generate_card_ids_from_sets] Failed to read cache, will refetch: {e}")

    def _fetch_one_set(sid: str):
        url = TCGDEX_SET_URL_TEMPLATE.format(set_id=sid)
        try:
            data = fetch_json(url)
        except Exception as e:
            print(f"[generate_card_ids_from_sets] Failed to fetch set {sid}: {e}")
            return []

        result = []
        cards = data.get("cards") or []
        for c in cards:
            cid = None
            if isinstance(c, str):
                cid = c
            elif isinstance(c, dict):
                cid = c.get("id") or c.get("cardID") or c.get("slug")
                if not cid:
                    local = c.get("localId") or c.get("number")
                    if local:
                        cid = f"{sid.lower()}-{str(local).lower()}"
            if cid:
                result.append(cid)
        return result

    collected = []
    seen = set()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS_SETS) as ex:
        futures = {ex.submit(_fetch_one_set, sid): sid for sid in set_id_list}
        for i, fut in enumerate(as_completed(futures), 1):
            res = fut.result() or []
            for cid in res:
                if cid not in seen:
                    seen.add(cid)
                    collected.append(cid)
            if i % 10 == 0:
                print(f"  ...processed {i}/{len(set_id_list)} sets, {len(collected)} unique card IDs")

    card_id_list = collected
    print(f"[generate_card_ids_from_sets] Collected {len(card_id_list)} unique card IDs from {len(set_id_list)} sets.")

    # Write cache for faster subsequent runs
    try:
        with open(CARD_ID_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(card_id_list, f, ensure_ascii=False, indent=0)
    except Exception as e:
        print(f"[generate_card_ids_from_sets] Failed to write cache: {e}")


def generate_cards_json():
    if not card_id_list:
        print("[generate_cards_json] card_id_list is empty. Run generate_card_ids_from_sets() first.")
        return

    print(f"[generate_cards_json] Fetching {len(card_id_list)} cards with {MAX_WORKERS_CARDS} workers...")
    output_cards = []

    def _fetch_one_card(cid: str):
        url = TCGDEX_CARD_URL_TEMPLATE.format(card_id=cid)
        try:
            card = fetch_json(url)
            if isinstance(card, dict):
                _normalize_card_inplace(card)
            return card
        except Exception as e:
            print(f"[generate_cards_json] Failed to fetch card {cid}: {e}")
            return None

    with ThreadPoolExecutor(max_workers=MAX_WORKERS_CARDS) as ex:
        futures = {ex.submit(_fetch_one_card, cid): cid for cid in card_id_list}
        for idx, fut in enumerate(as_completed(futures), 1):
            card = fut.result()
            if card is not None:
                output_cards.append(card)
            if idx % 200 == 0:
                print(f"  ...{idx} cards processed ({len(output_cards)} ok)")

    with open(EXPORT_CARD_PATH, "w", encoding="utf-8") as f:
        json.dump(output_cards, f, ensure_ascii=False, indent=4)

    print(f"[generate_cards_json] Wrote {len(output_cards)} cards to {EXPORT_CARD_PATH}")


def main():
    start_time = datetime.now()
    generate_set()
    generate_card_ids_from_sets()
    generate_cards_json()
    print("Finished in:", datetime.now() - start_time)

if __name__ == "__main__":
    main()
