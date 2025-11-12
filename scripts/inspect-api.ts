// scripts/inspect-api.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // carga las variables

const API_BASE = "https://v3.football.api-sports.io";
const API_KEY = process.env.FOOTBALL_API_KEY!;

const endpoints = [
    "/leagues",
    "/teams?league=39&season=2024", // Premier League
    "/players?team=33&season=2024", // Manchester United
    "/fixtures?league=39&season=2024",
    "/standings?league=39&season=2024",
];

async function inspect() {
    for (const endpoint of endpoints) {
        console.log(`\n🔍 ${endpoint}`);
        const { data } = await axios.get(`${API_BASE}${endpoint}`, {
            headers: { "x-apisports-key": API_KEY },
        });
        console.dir(data, { depth: 4 });
    }
}

inspect().catch(console.error);