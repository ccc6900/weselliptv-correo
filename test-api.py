import os
import requests
import json

# --- CONFIGURACIÓN ---
# La URL exacta del endpoint (debes confirmarla en la pestaña 'Endpoints' de RapidAPI)
API_URL = "https://cloud-api-hub-iptv-auto-subscriber.p.rapidapi.com/testforfree"

# La clave la leeremos desde los secretos de GitHub para no exponerla en el código
API_KEY = os.environ.get("RAPIDAPI_KEY")

def main():
    if not API_KEY:
        print("❌ Error: No se ha encontrado la RAPIDAPI_KEY en los secretos.")
        return

    # Cabeceras que exige RapidAPI
    headers = {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": "cloud-api-hub-iptv-auto-subscriber.p.rapidapi.com"
    }

    # Parámetros de la petición
    # Según la documentación, solo pide el código de país
    querystring = {"countryCode": "ES"} # ES = España

    print("Haciendo petición a la API...")
    
    try:
        response = requests.get(API_URL, headers=headers, params=querystring)
        
        # Mostramos el código de estado (200 = OK)
        print(f"Código de estado HTTP: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ ¡Respuesta recibida!")
            print("Datos obtenidos:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            # Si la respuesta es exitosa, el JSON debería contener las credenciales
            # (Los nombres de los campos pueden variar, pero suelen ser 'username', 'password', 'm3u_url')
        else:
            print("\n❌ Error en la petición:")
            print(response.text)

    except Exception as e:
        print(f"❌ Error de conexión: {e}")

if __name__ == "__main__":
    main()
