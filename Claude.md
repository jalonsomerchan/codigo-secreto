# Claude.md: Guía de Proyecto - Codigo Secreto

Este documento detalla el plan de diseño, arquitectura e implementación para un juego web de tipo **Single Page Application (SPA)** que utiliza una API específica para la gestión de usuarios, salas y puntuaciones, estilizado con Tailwind CSS.

---

## 1. Visión General del Proyecto

### Objetivo
Desarrollar un prototipo de juego web multijugador básico o de puntuación que interactúe con el backend en `https://alon.one/juegos/api`.

### Características Clave
* **One Single Page (SPA)**: Toda la navegación y el juego ocurren en un solo archivo HTML, gestionado por JavaScript.
* **Integración de API**: Uso de la librería `GameAPI.js` para comunicarse con el backend.
* **Estilo Moderno**: Uso de Tailwind CSS para una interfaz de usuario rápida y receptiva.
* **Separación de Preocupaciones**: Ficheros separados para HTML, CSS, JavaScript (Lógica y API).

---

## 2. Pila Tecnológica

| Componente | Tecnología | Uso |
| :--- | :--- | :--- |
| **Frontend** | HTML5 | Estructura del documento único. |
| **Estilos** | Tailwind CSS | Diseño visual responsive y moderno (vía CDN o CLI). |
| **Lógica** | JavaScript (ES6+) | Gestión de estado, DOM y lógica del juego. |
| **API** | `GameAPI.js` (Fetch) | Librería JS para consumo del backend PHP. |
| **Backend** | PHP/MariaDB | API REST provista. |


---

## 3. Flujo de Salas (Lobby)
La pantalla inicial tras el login permitirá dos acciones principales:

### A. Crear Sala (Rol: Administrador/Host)
* **Acción:** Ejecuta `POST /rooms`.
* **Privilegios:** * Es el único que visualiza y puede pulsar el botón **"Comenzar Juego"**.
    * Puede modificar los `room_settings` (ej: dificultad, tiempo) antes de empezar.
* **Transición:** Al pulsar "Comenzar", ejecuta un `PATCH` al estado de la sala cambiando el `status` a `"playing"`.

### B. Unirse a Sala (Rol: Jugador/Invitado)
* **Acción:** Introduce un código y ejecuta `POST /rooms/{code}/join`.
* **Restricciones:** * No tiene permisos para modificar la configuración.
    * Visualiza un mensaje de espera: *"Esperando a que el administrador inicie la partida..."*.


La informacion del jugador se guadará en el localstorage para reutilizar el usuario, auqnue podrá crear uno nuevo.

Después de cada partida se creará una nueva sala, con el mismo administrador y pasarán al lobby para iniciar una nueva partida.

La actualización de jugadores y del estado de la sala se realizará mediante WebSockets (IttySockets) en lugar de polling.

Las salas se podrán compartir mediante enlace (copiando el enlace o con webshare api) o mediante un QR.

---

## 4. Implementación de IttySockets

Para este proyecto, el uso de IttySockets se centrará en:

Actualización de Jugadores: Notificar cuando alguien entra o sale de la sala de espera.

Inicio de Partida: Sincronizar el salto de la pantalla de lobby a la de juego para todos los usuarios simultáneamente.

Chat/Acciones: Enviar mensajes rápidos o pequeñas acciones de juego.

---
Para adaptar tu documento y que el sistema (Claude o cualquier IA de desarrollo) implemente Código Secreto en lugar del Ahorcado, debes reescribir la sección de "Funcionamiento del juego" y ajustar la Lógica de Sincronización.

Sustituye el punto 4 de tu guía por lo siguiente para que el modelo genere la lógica correcta:

## 4. Funcionamiento del Juego (Código Secreto)
Mecánica Principal
El juego genera una cuadrícula de 5x5 palabras. La API asignará a cada palabra un tipo: Rojo, Azul, Civil (neutro) o Asesino.

Roles y Permisos
Guías de Espías (1 por equipo): Tienen acceso al "Mapa" completo. Pueden ver el color de todas las palabras. Su única acción permitida es enviar una Pista (Palabra + Número) a través de la API/Socket.

Agentes de Campo: Solo ven las palabras en gris. Deben seleccionar las palabras basándose en la pista de su Guía.

Flujo de Turnos y Puntuación
Fase de Pista: El Guía activo envía la pista. IttySockets notifica a los Agentes.

Fase de Adivinación: Los Agentes votan o seleccionan una palabra.

Acierto (Color propio): Se marca la palabra, suma punto y el equipo puede seguir eligiendo.

Fallo (Civil o Rival): Se marca la palabra y el turno pasa automáticamente al equipo contrario.

Asesino: El equipo que lo pulsa pierde la partida inmediatamente (status: "finished").

Configuración del Host: El administrador define el tiempo por turno y qué equipo empieza (el que empieza tiene 9 palabras, el otro 8).

Sincronización con IttySockets
Evento word_reveal: Al pulsar una palabra, se emite a todos los jugadores para actualizar el color de la tarjeta en sus pantallas.

Evento turn_switch: Sincroniza el cambio de interfaz entre el modo "Esperando pista" y "Eligiendo palabra".

## 5. Estructura de Datos sugerida (JSON)
Para que el backend gestione la sala, el objeto room_settings debe incluir:

JSON
{
  "grid": [
    {"word": "BANANA", "type": "red", "revealed": false},
    {"word": "MARTE", "type": "blue", "revealed": false},
    {"word": "BOMBA", "type": "assassin", "revealed": false}
  ],
  "turn": "red",
  "score": {"red": 0, "blue": 0}
}
---

## 6. Arquitectura de Ficheros

El proyecto debe mantener una estructura limpia para facilitar el mantenimiento y la escalabilidad.

# Reglas de Eficiencia - JS/HTML
- **Respuestas:** Solo código modificado. No reescribas archivos enteros.
- **Estilo:** ES6+, vanilla JS (sin frameworks a menos que lo pida).
- **HTML:** Usa nombres de clases semánticos.
- **Prohibido:** No des explicaciones teóricas ni introducciones ("Aquí tienes el código..."). Ve al grano.
