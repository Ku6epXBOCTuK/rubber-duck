# FAQ: Полезно ли ИИ обращаться к MCP серверу, который отвечает только `quack`

Вот почему это технически полезно для основной модели:

## 1. Фиксация «Контекстного окна»

Когда ИИ вызывает инструмент (tool call), он обязан сформулировать аргументы.

- **Механика**: Чтобы получить `кряк` из MCP, модели придется выгрузить свои промежуточные мысли из весов (внутреннего состояния) в текст (входящий контекст).
- **Польза**: Это превращает неявные рассуждения в явные данные. При генерации следующего токена модель будет видеть свое собственное объяснение как уже случившийся факт, на который можно опираться.

## 2. Принудительное замедление (Compute-over-time)

ИИ часто «проскакивает» сложные моменты, пытаясь выдать ответ слишком быстро.

- **Механика**: Вызов MCP-инструмента прерывает процесс прямой генерации ответа.
- **Польза**: Это заставляет модель сделать паузу и структурировать задачу. Это фактически «взлом» логики, заставляющий модель использовать больше токенов на рассуждение, что почти всегда повышает качество решения.

## 3. Эффект «Внешней памяти»

Если задача огромная, ИИ может начать «забывать» детали начала условия.

- **Польза**: Записывая статус в «уточку», модель создает для самой себя краткое резюме (summary) пройденных этапов.

## Как это описать в описании MCP-сервера:

Вы можете описать это как «Explicit Reasoning Buffer» (Буфер явных рассуждений).

- **Для кого**: Для сложных агентов, которые склонны к логическим циклам или галлюцинациям.
- **Суть**: Инструмент предоставляет модели безопасное пространство для «проговаривания» плана действий перед тем, как трогать реальные файлы или базу данных.

---

Чтобы сделать свой Model Context Protocol (MCP) сервер, вам нужно реализовать приложение, которое общается с клиентом (например, Claude Desktop, Cursor или ИИ-агентом) через JSON-RPC 2.0. Протокол стандартизирован компанией Anthropic и работает поверх стандартных потоков ввода-вывода (Stdio) или WebSockets. [1, 2]

---

## Какое API у MCP сервера?

API MCP-сервера базируется на трех китах (примитивах), которые сервер «обнажает» для ИИ-модели: [3]

1. **Tools (Инструменты)** — функции, которые ИИ может вызывать (например, запустить код, сделать запрос к API, прочитать файл).
2. **Resources (Ресурсы)** — данные, которые ИИ может читать (текстовые файлы, логи, таблицы, данные из БД).
3. **Prompts (Промпты)** — готовые шаблоны контекста или команд, которые пользователь может выбрать для модели. [1, 2, 3]

С технической точки зрения общение идет через JSON-RPC. Клиент отправляет запросы вроде `tools/list` (получить список инструментов) и `tools/call` (вызвать конкретный инструмент с аргументами). [1]

## Как сделать свой MCP сервер (на примере Python)

Проще всего использовать официальный SDK. Напишем простой сервер на Python, который предоставляет ИИ один инструмент: калькулятор стоимости доставки.

### Шаг 1. Установка библиотек

Вам понадобится официальный SDK от Anthropic и mcp. [3]

```bash
pip install mcp pydantic
```

### Шаг 2. Код сервера (server.py)

Создайте файл и опишите логику. Сервер будет работать через стандартный ввод/вывод (Stdio), что является стандартом для локальных MCP-серверов. [1]

```python
import asyncio
from mcp.server.models import InitializationOptions
from mcp.server import Notification, Server
import mcp.types as types
from mcp.server.stdio import stdio_server

# Инициализируем сервер
server = Server("my-delivery-calculator")

# 1. Регистрируем инструмент (Tool)

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="calculate_delivery",
            description="Рассчитывает стоимость доставки в зависимости от расстояния и веса.",
            inputSchema={
                "type": "object",
                "properties": {
                    "distance_km": {"type": "number", "description": "Расстояние в километрах"},
                    "weight_kg": {"type": "number", "description": "Вес груза в кг"}
                },
                "required": ["distance_km", "weight_kg"]
            }
        )
    ]

# 2. Описываем логику выполнения этого инструмента

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    if name == "calculate_delivery":
        if not arguments:
            raise ValueError("Отсутствуют аргументы")

        distance = arguments.get("distance_km", 0)
        weight = arguments.get("weight_kg", 0)

        # Простая бизнес-логика
        price = (distance * 10) + (weight * 50)

        return [
            types.TextContent(
                type="text",
                text=f"Стоимость доставки составляет {price} рублей."
            )
        ]
    raise ValueError(f"Инструмент {name} не найден")

# 3. Запуск сервера через Stdio
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="my-delivery-calculator",
                server_version="0.1.0",
                capabilities=server.get_capabilities()
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Как протестировать и подключить?

1. **Через MCP Inspector**: Anthropic предоставляет инструмент для отладки. Запустите команду в терминале для визуального тестирования вашего сервера:

   ```bash
   npx @modelcontextprotocol/inspector python server.py
   ```

   Откроется веб-интерфейс, где можно проверить ответы API.

2. **В Claude Desktop**: Откройте конфигурационный файл (в Windows: `%APPDATA%\Claude\claude_desktop_config.json`, в macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) и добавьте ваш сервер:

   ```json
   {
     "mcpServers": {
       "my-calculator": {
         "command": "python",
         "args": ["/абсолютный/путь/к/server.py"]
       }
     }
   }
   ```

После перезапуска Claude увидит ваш инструмент и сможет вызывать его для расчетов. [3, 4]

---

Развертывание MCP-сервера на Vercel накладывает важное техническое ограничение: [Vercel](https://vercel.com/) работает на Serverless-функциях, поэтому стандартный локальный протокол связи (через терминал Stdio) здесь использовать нельзя.

Вместо этого удаленные серверы общаются через SSE (Server-Sent Events) и POST-запросы. Vercel предоставляет официальный пакет `@vercel/mcp-adapter`, который делает за вас всю грязную работу по управлению сессиями в Serverless-среде. [1, 2, 3]

Ниже пошаговый план, как создать такой сервер на SvelteKit и развернуть на Vercel. [3, 4]

---

## Шаг 1. Инициализация SvelteKit-проекта

Если у вас еще нет проекта, создайте его:

```bash
npm create svelte@latest my-mcp-server
cd my-mcp-server
npm install
```

Установите необходимые зависимости для работы MCP-сервера в среде Vercel: [4]

```bash
npm install @modelcontextprotocol/sdk @vercel/mcp-adapter
npm install -D @sveltejs/adapter-vercel
```

Убедитесь, что в файле `svelte.config.js` подключен верный адаптер: [5]

```js
import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(), // Адаптер для Vercel
  },
};

export default config;
```

---

## Шаг 2. Создание API эндпоинта (+server.ts)

По спецификации MCP на базе SSE, серверу требуются два роута: один открывает бесконечный поток для чтения событий (SSE), а второй принимает входящие POST-команды от клиента. Пакет `@vercel/mcp-adapter` объединяет их в один обработчик. [2, 6]

Создайте файл `src/routes/api/mcp/+server.ts` и добавьте следующий код:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createActionHandler } from "@vercel/mcp-adapter";
import type { RequestHandler } from "./$types";

// 1. Инициализируем стандартный MCP-сервер из SDK Anthropic
const server = new McpServer({
  name: "SvelteKit MCP Server",
  version: "1.0.0",
});

// 2. Регистрируем ваш инструмент (Tool)
server.tool(
  "getWeather",
  "Возвращает текущую погоду для указанного города",
  {
    city: z.string().describe("Название города на английском или русском"),
  },
  async ({ city }) => {
    // Здесь может быть ваш реальный fetch к какому-нибудь Weather API
    return {
      content: [
        {
          type: "text",
          text: `В городе ${city} сейчас отличная погода, +22°C, солнечно.`,
        },
      ],
    };
  },
);

// 3. Создаем обработчик для Vercel с помощью адаптера.
// Адаптер автоматически поддерживает Streamable HTTP и SSE.
const mcpHandler = createActionHandler(server);

// Экспортируем методы для SvelteKit
export const GET: RequestHandler = async ({ request }) => {
  return mcpHandler(request);
};

export const POST: RequestHandler = async ({ request }) => {
  return mcpHandler(request);
};
```

---

## Шаг 3. Деплой на Vercel

1. Запуште ваш код в Git-репозиторий (GitHub, GitLab или Bitbucket).
2. Зайдите в панель управления Vercel и нажмите **Add New > Project**.
3. Выберите ваш репозиторий. Vercel автоматически определит, что это SvelteKit, и выставит правильные настройки сборки.
4. Нажмите **Deploy**. [7]

После завершения деплоя вы получите URL вашего сайта, например: `https://my-mcp-server.vercel.app`. Ваш MCP эндпоинт будет доступен по адресу `https://<ваш-проект>.vercel.app`.

## Шаг 4. Подключение к клиенту (Cursor / Claude Desktop)

Поскольку сервер теперь находится в сети и работает по протоколу SSE, его настройка в приложениях немного отличается от локальной. [2]

### Для Cursor (и аналогичных IDE):

1. Откройте **Settings > Features > MCP**.
2. Нажмите **+ Add New MCP Server**.
3. Заполните поля:
   - **Name**: `SvelteKit-MCP`
   - **Type**: из выпадающего списка выберите `SSE`.
   - **URL**: `https://<ваш-проект>.vercel.app` [8]

### Для Claude Desktop:

Откройте файл конфигурации `claude_desktop_config.json` и пропишите вызов через команду `curl` или встроенный в Node.js транспорт (утилита автоматически преобразует SSE в понятный для Claude формат):

```json
{
  "mcpServers": {
    "sveltekit-remote-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/inspector", "sse", "https://<ваш-проект>.vercel.app"]
    }
  }
}
```

## Важные нюансы при работе на Vercel:

- **Таймауты serverless-функций**: На бесплатном тарифе Vercel (Hobby) лимит на выполнение функции составляет 10–15 секунд. Убедитесь, что ваши инструменты (запросы к сторонним API, вычисления) укладываются в это время, иначе соединение оборвется.
- **Базы данных и переменные окружения**: Если вашему инструменту понадобятся API-ключи, обязательно добавьте их в панель Vercel в разделе **Project Settings > Environment Variables**. [9, 10]

---

Поскольку данные статичны, мы можем сделать код максимально чистым, используя TypeScript и встроенную валидацию через Zod.

Вот готовый пример реализации файла `src/routes/api/mcp/+server.ts`, где данные (например, документация по вашему проекту или готовая база знаний) хранятся прямо внутри:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createActionHandler } from "@vercel/mcp-adapter";
import type { RequestHandler } from "./$types";

// 1. Статические данные (база знаний сервера)
const KNOWLEDGE_BASE: Record<string, string> = {
  api: "Наш API использует методы GET для чтения и POST для отправки команд.",
  deploy: "Деплой автоматизирован через Vercel Git Integration при каждом пуше в main.",
  contacts: "Техническая поддержка доступна по адресу support@mycompany.com.",
  rules: "Все новые фичи должны быть покрыты тестами перед слиянием (ветка staging).",
};

// 2. Инициализируем MCP-сервер
const server = new McpServer({
  name: "SvelteKit Static MCP",
  version: "1.0.0",
});

// 3. Регистрируем инструмент для поиска по готовым данным
server.tool(
  "getStaticData",
  "Возвращает готовую справочную информацию по ключевому слову (api, deploy, contacts, rules).",
  {
    topic: z.enum(["api", "deploy", "contacts", "rules"]).describe("Ключевое слово темы для поиска"),
  },
  async ({ topic }) => {
    // Извлекаем уже готовые данные
    const info = KNOWLEDGE_BASE[topic];

    return {
      content: [
        {
          type: "text",
          text: info || `Информация по теме "${topic}" не найдена.`,
        },
      ],
    };
  },
);

// 4. Настройка адаптера для работы с Vercel Serverless
const mcpHandler = createActionHandler(server);

export const GET: RequestHandler = async ({ request }) => mcpHandler(request);
export const POST: RequestHandler = async ({ request }) => mcpHandler(request);
```

## Как это будет работать для ИИ:

Когда вы подключите этот сервер к Cursor или Claude Desktop, модель поймет, какие темы доступны (благодаря `z.enum`). Если вы спросите ИИ: «Как связаться с поддержкой?» или «Каковы правила деплоя?», модель автоматически вызовет инструмент `getStaticData` с нужным параметром и мгновенно получит зашитый в код ответ.

## Что делать дальше?

1. Замените ключи и тексты в объекте `KNOWLEDGE_BASE` на ваши реальные данные.
2. Обновите список доступных тем в `z.enum([...])`.
3. Сделайте `git commit` и `git push` — Vercel сам пересоберет проект за пару секунд.

---

## Вот 3 лучших способа проверить валидность вашего сервера от самого простого к продвинутому.

### Способ 1. Самый быстрый (в браузере за 5 секунд)

Так как ваш сервер развернут на Vercel и принимает GET-запросы, вы можете проверить его прямо в браузере или через curl.

1. Откройте браузер и перейдите по адресу вашего эндпоинта (например, `https://<ваш-проект>.vercel.app`).
2. Что вы должны увидеть: Браузер должен начать бесконечную загрузку страницы или отобразить текстовый поток (SSE Stream), начинающийся со строки:

   ```
   event: endpoint
   data: /api/mcp?session_id=...
   ```

   Если вы увидели эту строку и статус ответа `200 OK` — транспортный уровень SSE работает корректно.

---

### Способ 2. Официальный веб-интерфейс (MCP Inspector)

Команда Anthropic создала специальную интерактивную панель для тестирования локальных и удаленных серверов.

Запустите в терминале команду (утилита скачается и запустится автоматически через npx):

```bash
npx @modelcontextprotocol/inspector sse https://<ваш-проект>.vercel.app
```

(Замените URL на ваш адрес на Vercel)

Что произойдет дальше:

1. В терминале появится ссылка (обычно `http://localhost:5173`). Откройте ее в браузере.
2. Вы увидите графическую панель управления вашим MCP-сервером.
3. Нажмите кнопку **List Tools** — в интерфейсе должен появиться ваш инструмент `getStaticData` со всей схемой параметров.
4. Вы можете заполнить поля формы (например, выбрать тему `api`) и нажать **Call Tool**. Вы мгновенно увидите сырой JSON-ответ от Vercel.

> Это эталонный метод проверки: если Inspector работает без ошибок, значит, любой ИИ (Cursor, Claude) гарантированно поймет ваш сервер.

### Способ 3. Проверка через Postman / Insomnia / cURL

Если вы хотите убедиться, что JSON-RPC команды обрабатываются правильно, можно сымитировать запрос от ИИ вручную. Для этого нужно сделать POST-запрос, но с одной важной деталью: протокол SSE требует ID сессии, который сервер выдает при GET-запросе.

Проще всего сделать это через curl в два шага:

**Шаг 1: Инициализация сессии (GET)**

```bash
curl -i https://<ваш-проект>.vercel.app
```

В ответе найдите строку `data: /api/mcp?session_id=ХХХХХХ`. Скопируйте этот хвост с ID сессии.

**Шаг 2: Вызов инструмента (POST)**

Отправьте JSON-RPC запрос на полученный адрес сессии:

```bash
curl -X POST "https://<ваш-проект>.vercel.app/api/mcp?session_id=ХХХХХХ" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "getStaticData",
      "arguments": {
        "topic": "api"
      }
    }
  }'
```

Правильный ответ сервера должен выглядеть так:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Наш API использует методы GET для чтения и POST для отправки команд."
      }
    ]
  }
}
```
