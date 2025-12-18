import json
import os

# Get the script directory
script_dir = os.path.dirname(os.path.abspath(__file__))

# Load reference.json to get card details
reference_path = os.path.join(script_dir, "reference.json")
with open(reference_path, "r", encoding="utf-8") as f:
    reference_data = json.load(f)

# Load card.json to get the count
cards_path = os.path.join(script_dir, "card.json")
with open(cards_path, "r", encoding="utf-8") as f:
    cards_data = json.load(f)

# Create a lookup for cards by cardDefKey
cards_lookup = {}
for card in cards_data:
    cards_lookup[card["cardId"]] = card["amount"]

# Combine both JSON files
combined = []
for ref_card in reference_data:
    card_def_key = ref_card["cardDefKey"]
    
    # Check if this card exists in cards.json
    if card_def_key in cards_lookup:
        url = ref_card["url"]
        expansion_id = ref_card["expansionId"]
        
        # Get card number from URL (split by '/' and get index 3)
        card_number = url.split('/')[3]
        
        # Create ID: expansionId + card_number, then uppercase
        card_id = (expansion_id + "-" + card_number).upper()
        
        # Replace PROMO- with P-
        card_id = card_id.replace("PROMO-", "P-")
        
        combined.append({
            "Id": card_id,
            "cardDefKey": card_def_key,
            "expansionId": expansion_id,
            "url": url,
            "amount": cards_lookup[card_def_key]
        })

# Sort by ID
combined.sort(key=lambda x: x["Id"])

# Save combined data
combined_path = os.path.join(script_dir, "combined.json")
with open(combined_path, "w", encoding="utf-8") as f:
    json.dump(combined, f, indent=2, ensure_ascii=False)

# Generate CSV file
import csv

csv_path = os.path.join(script_dir, "output.csv")
with open(csv_path, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["ID", "CardName", "NumberOwn", "Expansion", "Pack", "Rarity"])
    
    for card in combined:
        writer.writerow([
            card["Id"],
            "",
            card["amount"],
            "",
            "",
            ""
        ])

print("Export completed -> combined.json and output.csv")
