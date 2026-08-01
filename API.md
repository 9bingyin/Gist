# Gist API 文档

## 订阅管理 API

### 概述
订阅管理 API 提供了对 RSS 订阅源的完整管理功能，包括创建、读取、更新和删除操作。

### 基础 URL
```
http://localhost:8080/api
```

### 认证
API 使用 Token 认证。在请求头中包含：
```
Authorization: Bearer <your_token>
```

---

## 端点

### 1. 获取所有订阅源
**请求**
```http
GET /api/feeds
```

**响应示例**
```json
{
  "data": [
    {
      "id": "1",
      "title": "GitHub Blog",
      "url": "https://github.blog/feed",
      "description": "Updates from the GitHub team",
      "category": "Technology",
      "unread_count": 5,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-20T15:45:00Z"
    }
  ]
}
```

---

### 2. 获取单个订阅源
**请求**
```http
GET /api/feeds/{feed_id}
```

**参数**
- `feed_id` (path): 订阅源 ID

**响应示例**
```json
{
  "data": {
    "id": "1",
    "title": "GitHub Blog",
    "url": "https://github.blog/feed",
    "description": "Updates from the GitHub team",
    "category": "Technology",
    "unread_count": 5,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

---

### 3. 创建新订阅源
**请求**
```http
POST /api/feeds
Content-Type: application/json

{
  "url": "https://example.com/feed",
  "title": "Example Feed",
  "category": "Technology"
}
```

**请求体参数**
- `url` (string, 必需): RSS 订阅源 URL
- `title` (string, 可选): 自定义标题
- `category` (string, 可选): 分类名称

**响应示例**
```json
{
  "data": {
    "id": "2",
    "title": "Example Feed",
    "url": "https://example.com/feed",
    "category": "Technology",
    "created_at": "2024-01-20T16:00:00Z"
  }
}
```

---

### 4. 更新订阅源
**请求**
```http
PUT /api/feeds/{feed_id}
Content-Type: application/json

{
  "title": "Updated Title",
  "category": "News"
}
```

**请求体参数**
- `title` (string, 可选): 新的标题
- `category` (string, 可选): 新的分类

**响应示例**
```json
{
  "data": {
    "id": "1",
    "title": "Updated Title",
    "category": "News",
    "updated_at": "2024-01-20T16:30:00Z"
  }
}
```

---

### 5. 删除订阅源
**请求**
```http
DELETE /api/feeds/{feed_id}
```

**响应示例**
```json
{
  "message": "Feed deleted successfully"
}
```

---

### 6. 获取订阅源下的文章
**请求**
```http
GET /api/feeds/{feed_id}/articles
```

**查询参数**
- `limit` (int, 可选): 返回结果数量，默认 20
- `offset` (int, 可选): 分页偏移量，默认 0
- `unread_only` (boolean, 可选): 仅返回未读文章，默认 false

**响应示例**
```json
{
  "data": [
    {
      "id": "article_1",
      "title": "Article Title",
      "content": "Article content...",
      "link": "https://example.com/article",
      "author": "Author Name",
      "published_at": "2024-01-20T10:00:00Z",
      "is_read": false,
      "is_starred": false
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

---

### 7. 更新文章状态
**请求**
```http
PUT /api/articles/{article_id}
Content-Type: application/json

{
  "is_read": true,
  "is_starred": false
}
```

**请求体参数**
- `is_read` (boolean, 可选): 标记为已读/未读
- `is_starred` (boolean, 可选): 标记为收藏/取消收藏

**响应示例**
```json
{
  "data": {
    "id": "article_1",
    "is_read": true,
    "is_starred": false,
    "updated_at": "2024-01-20T16:45:00Z"
  }
}
```

---

## 错误处理

### 错误响应格式
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descriptive error message"
  }
}
```

### 常见错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| `FEED_NOT_FOUND` | 404 | 订阅源不存在 |
| `INVALID_URL` | 400 | 无效的 URL 格式 |
| `DUPLICATE_FEED` | 409 | 订阅源已存在 |
| `UNAUTHORIZED` | 401 | 未授权或 Token 无效 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 速率限制

- 每个用户每分钟最多 60 个请求
- 响应头包含 `X-RateLimit-*` 信息

---

## 最佳实践

1. **批量操作**: 尽量避免频繁的单个请求，使用批量 API 时提高效率
2. **缓存**: 在客户端实现适当的缓存策略
3. **重试策略**: 遇到 5xx 错误时采用指数退避重试
4. **分页**: 大量数据查询时使用分页参数
