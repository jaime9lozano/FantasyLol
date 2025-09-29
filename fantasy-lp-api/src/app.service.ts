import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fantasy LoL Esports</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wlay=swap
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Orbitron', sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .container {
            max-width: 600px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 15px;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
            text-align: center;
          }
          h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
            color: #00ffcc;
          }
          p {
            font-size: 1.2em;
            line-height: 1.6;
          }
          .highlight {
            color: #ffcc00;
            font-weight: bold;
          }
          .btn {
            margin-top: 30px;
            padding: 12px 25px;
            background-color: #00ffcc;
            color: #000;
            border: none;
            border-radius: 8px;
            font-size: 1em;
            cursor: pointer;
            transition: 0.3s ease;
          }
          .btn:hover {
            background-color: #00ccaa;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Fantasy LoL Esports</h1>
          <p>
            ⚔️ <span class="highlight">Forma tu equipo ideal</span> con los mejores jugadores del competitivo mundial.<br>
            📊 <span class="highlight">Sigue estadísticas en tiempo real</span> y compite contra otros invocadores.<br>
            🎮 <span class="highlight">Vive la emoción de los esports</span> como nunca antes.<br><br>
            ¿Estás listo para convertirte en el próximo <span class="highlight">campeón del Fantasy Rift</span>?
          </p>
          <button class="btn">¡Comenzar!</button>
        </div>
      </body>
      </html>
    `;
  }
}
