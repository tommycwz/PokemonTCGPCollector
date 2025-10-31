import requests
import json
from datetime import datetime
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Export paths
EXPORT_SET_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\src\\assets\\cards\\sets.json"
EXPORT_CARD_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\src\\assets\\cards\\cards.json"

# EXPORT_SET_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\cards\\sets.json"
# EXPORT_CARD_PATH = r"D:\\Project\\Angular\\PokemonTCGPCollector\\script\\cards\\cards.json"

# Data source URLs
POCKETDB_SET_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/sets.json"
POCKETDB_CARD_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json"
TCGDX_SETS_URL = "https://api.tcgdex.net/v2/en/series/tcgp"
TCGDX_CARD_URL_TEMPLATE = "https://api.tcgdex.net/v2/en/cards/{card_id}"

# Performance settings
REQUEST_TIMEOUT = (6, 30)  # (connect, read) seconds
MAX_WORKERS_CARDS = 8  # Parallel processing for card details

_thread_local = threading.local()


def _build_session() -> requests.Session:
    """Build a session with retry strategy and proper headers."""
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
        "User-Agent": "PokemonTCGPCollector/2.0 (+https://github.com/tommycwz)",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    })
    return s


def _get_session() -> requests.Session:
    """Get thread-local session."""
    sess = getattr(_thread_local, "session", None)
    if sess is None:
        sess = _build_session()
        _thread_local.session = sess
    return sess


def extract_series(code: str) -> str:
    """Extract series from set code.
    For promo sets (P-X): returns X
    For other sets (X1, X1A): returns X (first character)
    """
    if code.startswith("P-"):
        # For promo sets like P-A, P-B, return the part after P-
        return code[2:]
    else:
        # For other sets like A1, A1A, B1, return the first character
        return code[0] if code else ""


def fetch_json(url: str):
    """Fetch JSON data from URL with retry logic."""
    sess = _get_session()
    print(f"Fetching: {url}")
    resp = sess.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def generate_sets():
    """Fetch and merge sets data from PocketDB and TCGDX."""
    print("[generate_sets] Fetching sets data from both sources...")
    try:
        # Fetch both sources
        print("[generate_sets] Fetching PocketDB data...")
        pocketdb_data = fetch_json(POCKETDB_SET_URL)
        
        print("[generate_sets] Fetching TCGDX data...")
        tcgdx_data = fetch_json(TCGDX_SETS_URL)
        
        # Create lookup for PocketDB data by code, normalizing PROMO codes
        pocketdb_lookup = {}
        for s in pocketdb_data:
            code = s.get("code", "").upper()
            # Normalize PROMO-X to P-X format
            if code.startswith("PROMO-"):
                code = code.replace("PROMO-", "P-")
            pocketdb_lookup[code] = s
        
        # Get TCGDX sets
        tcgdx_sets = tcgdx_data.get("sets", [])
        
        processed_sets = []
        
        # Process TCGDX sets and merge with PocketDB data
        for tcgdx_set in tcgdx_sets:
            code = tcgdx_set.get("id", "").upper()
            
            # Get card count from TCGDX
            card_count = tcgdx_set.get("cardCount", {}).get("total", 0)
            
            # Extract series from code
            series = extract_series(code)
            
            print(f"Processing set {code}: count={card_count}, series={series}")
            
            processed_set = {
                "code": code,
                "name": tcgdx_set.get("name", "Unknown"),
                "series": series,
                "count": card_count,
                "releaseDate": None,
                "packs": []
            }
            
            # Merge with PocketDB data if available
            if code in pocketdb_lookup:
                pocket_set = pocketdb_lookup[code]
                processed_set["releaseDate"] = pocket_set.get("releaseDate")
                processed_set["packs"] = pocket_set.get("packs", [])
                # Use PocketDB count if TCGDX doesn't have it
                if not card_count:
                    processed_set["count"] = pocket_set.get("total", 0)
            
            processed_sets.append(processed_set)
        
        # Add any PocketDB-only sets that weren't in TCGDX
        for code, pocket_set in pocketdb_lookup.items():
            if not any(s["code"] == code for s in processed_sets):
                series = extract_series(code)
                processed_set = {
                    "code": code,
                    "name": pocket_set.get("label", {}).get("en", "Unknown"),
                    "series": series,
                    "count": pocket_set.get("total", 0),
                    "releaseDate": pocket_set.get("releaseDate"),
                    "packs": pocket_set.get("packs", [])
                }
                processed_sets.append(processed_set)
        
        # Sort sets: group by series, promo sets at the end of each series
        def sort_key(set_item):
            series = set_item["series"]
            code = set_item["code"]
            is_promo = code.startswith("P-")
            
            # Primary sort by series (A, B, etc.)
            # Secondary sort: promos go last (1 for promo, 0 for regular)
            # Tertiary sort: by code for consistent ordering within type
            return (series, is_promo, code)
        
        processed_sets.sort(key=sort_key)
        
        # Ensure export directory exists
        os.makedirs(os.path.dirname(EXPORT_SET_PATH), exist_ok=True)
        
        # Write to file
        with open(EXPORT_SET_PATH, "w", encoding="utf-8") as f:
            json.dump(processed_sets, f, ensure_ascii=False, indent=4)
        
        print(f"[generate_sets] Successfully wrote {len(processed_sets)} sets to {EXPORT_SET_PATH}")
        return processed_sets
        
    except Exception as e:
        print(f"[generate_sets] Error: {e}")
        return []


def generate_card_id(set_code: str, number: int) -> str:
    """Generate card ID in format SET-NUMBER (e.g., A4A-094)."""
    return f"{set_code}-{number:03d}"


def fetch_card_details(card_id: str):
    """Fetch additional card details from TCGDX API."""
    url = TCGDX_CARD_URL_TEMPLATE.format(card_id=card_id.upper())
    try:
        return fetch_json(url)
    except Exception as e:
        print(f"Failed to fetch details for {card_id}: {e}")
        return None


def normalize_rarity(rarity_code: str) -> str:
    """Normalize rarity code to symbol representation."""
    rarity_mapping = {
        "C": "◊",
        "U": "◊◊", 
        "R": "◊◊◊",
        "RR": "◊◊◊◊",
        "AR": "☆",
        "SR": "☆☆",
        "SAR": "☆☆",
        "IM": "☆☆☆",
        "UR": "👑",
        "CR": "👑",
        "S": "✵",
        "SSR": "✵✵"
    }
    return rarity_mapping.get(rarity_code, rarity_code)


def generate_cards():
    """Fetch and process cards data from PocketDB and enrich with TCGDX data."""
    print("[generate_cards] Fetching cards data...")
    try:
        cards_data = fetch_json(POCKETDB_CARD_URL)
        
        print(f"[generate_cards] Processing {len(cards_data)} cards...")
        
        # Process each card to normalize rarity, set codes, and fetch additional details
        rarity_updates = 0
        set_updates = 0
        details_fetched = 0
        
        # Process more cards with TCGDX enrichment to get abilities and evolveFrom data
        ENABLE_TCGDX_ENRICHMENT = True
        MAX_CARDS_TO_ENRICH = 500  # Increased limit to get more cards with abilities
        
        for i, card in enumerate(cards_data):
            # Normalize rarity
            if "rarityCode" in card:
                original_rarity = card.get("rarity", "")
                rarity_code = card.get("rarityCode", "")
                normalized_rarity = normalize_rarity(rarity_code)
                if normalized_rarity != original_rarity:
                    card["rarity"] = normalized_rarity
                    rarity_updates += 1
                # Remove rarityCode field
                del card["rarityCode"]
            
            # Normalize set codes and add series
            if "set" in card:
                original_set = card.get("set", "")
                if original_set.startswith("PROMO-"):
                    normalized_set = original_set.replace("PROMO-", "P-")
                    card["set"] = normalized_set
                    set_updates += 1
                
                # Add series field based on set code and reorder fields
                current_set = card.get("set", "")
                series = extract_series(current_set)
                
                # Generate ID field
                number = card.get("number", 0)
                card_id = generate_card_id(current_set, number) if current_set and number else ""
                
                # Create a new ordered dictionary with series first, then set, number, id
                reordered_card = {}
                reordered_card["series"] = series
                reordered_card["set"] = current_set
                reordered_card["number"] = card.get("number")
                reordered_card["id"] = card_id
                
                # Add all other fields in original order
                for key, value in card.items():
                    if key not in ["series", "set", "number", "id"]:
                        reordered_card[key] = value
                
                # Replace the card with reordered version
                cards_data[i] = reordered_card
                card = reordered_card
            
            # Fetch additional details from TCGDX (limited for testing)
            if ENABLE_TCGDX_ENRICHMENT and details_fetched < MAX_CARDS_TO_ENRICH:
                set_code = card.get("set", "")
                number = card.get("number", 0)
                if set_code and number:
                    card_id = generate_card_id(set_code, number)
                    tcgdx_details = fetch_card_details(card_id)
                    
                    if tcgdx_details:
                        # Add TCGDX fields if they exist
                        tcgdx_fields = ["hp", "types", "description", "stage", "attacks", "weaknesses", "retreat", "abilities", "evolveFrom"]
                        for field in tcgdx_fields:
                            if field in tcgdx_details:
                                card[field] = tcgdx_details[field]
                        details_fetched += 1
                        print(f"  Enriched card {card_id} ({details_fetched}/{MAX_CARDS_TO_ENRICH})")
            
            # Progress indicator for overall processing
            if (i + 1) % 500 == 0:
                print(f"  ...processed {i + 1}/{len(cards_data)} cards")
        
        print(f"[generate_cards] Updated rarity for {rarity_updates} cards, normalized {set_updates} set codes, enriched {details_fetched} cards with TCGDX data, and removed rarityCode field")
        
        # Ensure export directory exists
        os.makedirs(os.path.dirname(EXPORT_CARD_PATH), exist_ok=True)
        
        # Write to file
        with open(EXPORT_CARD_PATH, "w", encoding="utf-8") as f:
            json.dump(cards_data, f, ensure_ascii=False, indent=2)
        
        print(f"[generate_cards] Successfully wrote {len(cards_data)} cards to {EXPORT_CARD_PATH}")
        return cards_data
        
    except Exception as e:
        print(f"[generate_cards] Error: {e}")
        return []


def main():
    """Main execution function."""
    start_time = datetime.now()
    print("Starting Pokemon TCG Pocket data generation...")
    
    # Generate sets
    sets_data = generate_sets()
    
    # Generate cards
    cards_data = generate_cards()
    
    end_time = datetime.now()
    print(f"Generation completed in: {end_time - start_time}")
    print(f"Files exported to:")
    print(f"  Sets: {EXPORT_SET_PATH}")
    print(f"  Cards: {EXPORT_CARD_PATH}")


if __name__ == "__main__":
    main()
