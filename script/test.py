# Get Data from https://www.pokemon-zone.com/api/game/game-data/
import requests
import json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.pokemon-zone.com/',
    'Origin': 'https://www.pokemon-zone.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
}

try:
    print("Fetching from pokemon-zone.com/api/game/game-data/...")
    response = requests.get('https://www.pokemon-zone.com/api/game/game-data/', headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\nSuccess! Retrieved {len(data)} items")
        
        # Show structure of first item
        if data and len(data) > 0:
            print(f"\nFirst item structure:")
            print(json.dumps(data[0], indent=2, ensure_ascii=False)[:500])
            
        # Save to file
        with open('game-data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("\nSaved to game-data.json")
    else:
        print(f"\nFailed with status {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
except Exception as e:
    print(f"Error: {e}")