package service_test

import (
	"context"
	"database/sql"
	"net/http"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"
	"gist/backend/pkg/network"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestReadabilityService_FetchReadableContent_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{}, sql.ErrNoRows)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	_, err := svc.FetchReadableContent(context.Background(), 1)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestReadabilityService_FetchReadableContent_CacheHit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	readable := "<article>cached</article>"
	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{
		ID:              1,
		ReadableContent: &readable,
	}, nil)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	got, err := svc.FetchReadableContent(context.Background(), 1)
	require.NoError(t, err)
	require.Equal(t, readable, got)
}

func TestReadabilityService_FetchReadableContent_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{ID: 1}, nil)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	_, err := svc.FetchReadableContent(context.Background(), 1)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestReadabilityService_Close(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)
	svc.Close()
}

func TestReadabilityService_FetchWithChrome_InvalidURL(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityFetchWithChromeForTest(svc, context.Background(), "http://[::1", "", 0)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

func TestReadabilityService_FetchWithFreshSession_InvalidScheme(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityFetchWithFreshSessionForTest(svc, context.Background(), "file:///etc/passwd", "", 0)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestReadabilityService_DoFetch_InvalidURL(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityDoFetchForTest(svc, context.Background(), "http://[::1", "", 0)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

// TestFixLazyImages_RuyoNet tests lazy image fix for 51.ruyo.net style pages.
// Real case: https://51.ruyo.net/19255.html
// These pages use data-original with a placeholder SVG in src.
func TestFixLazyImages_RuyoNet(t *testing.T) {
	// Real HTML pattern from 51.ruyo.net
	input := []byte(`<html><body>
		<p><img data-original="https://img10.360buyimg.com/ddimg/jfs/t1/361234/10/6826/72925/691c15d1Fc812aa5a/390c89b15cb1a566.jpg" src="https://51.ruyo.net/wp-content/themes/CorePress-Pro/static/img/loading/doublering.svg"/></p>
		<p><img data-original="https://img13.360buyimg.com/ddimg/jfs/t1/390401/27/3049/13985/696ee149F9745f050/00155a01f4c85f94.jpg" src="https://51.ruyo.net/wp-content/themes/CorePress-Pro/static/img/loading/doublering.svg" width="714" height="248" class=""/></p>
	</body></html>`)

	result := string(service.FixLazyImagesForTest(input))

	// Should replace placeholder SVG with real image from data-original
	require.Contains(t, result, `src="https://img10.360buyimg.com/ddimg/jfs/t1/361234/10/6826/72925/691c15d1Fc812aa5a/390c89b15cb1a566.jpg"`)
	require.Contains(t, result, `src="https://img13.360buyimg.com/ddimg/jfs/t1/390401/27/3049/13985/696ee149F9745f050/00155a01f4c85f94.jpg"`)

	// Should NOT contain placeholder SVG as src
	require.NotContains(t, result, `src="https://51.ruyo.net/wp-content/themes/CorePress-Pro/static/img/loading/doublering.svg"`)
}

// TestFixLazyImages_PreservesNormalImages ensures normal images are not modified.
func TestFixLazyImages_PreservesNormalImages(t *testing.T) {
	input := []byte(`<html><body>
		<img src="https://example.com/normal-image.jpg" alt="Normal image"/>
		<img src="https://cdn.example.com/photo.png" width="800"/>
	</body></html>`)

	result := string(service.FixLazyImagesForTest(input))

	require.Contains(t, result, `src="https://example.com/normal-image.jpg"`)
	require.Contains(t, result, `src="https://cdn.example.com/photo.png"`)
}

// TestFixLazyImages_IgnoresDataOriginalWithDataURI ensures data: URIs in data-original are ignored.
func TestFixLazyImages_IgnoresDataOriginalWithDataURI(t *testing.T) {
	input := []byte(`<html><body>
		<img data-original="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i" src="https://example.com/real.jpg"/>
	</body></html>`)

	result := string(service.FixLazyImagesForTest(input))

	// Should keep original src since data-original is a data URI
	require.Contains(t, result, `src="https://example.com/real.jpg"`)
}

// TestFixLazyImages_AddsSourceWhenMissing handles images with data-original but no src.
func TestFixLazyImages_AddsSourceWhenMissing(t *testing.T) {
	input := []byte(`<html><body>
		<img data-original="https://example.com/lazy-image.jpg" alt="Lazy"/>
	</body></html>`)

	result := string(service.FixLazyImagesForTest(input))

	require.Contains(t, result, `src="https://example.com/lazy-image.jpg"`)
}

// TestRemoveMetadataElements_GoogleBlog tests date removal for Google Developer Blog.
// Real case: https://developers.googleblog.com/en/a-guide-to-fine-tuning-functiongemma/
func TestRemoveMetadataElements_GoogleBlog(t *testing.T) {
	// Real HTML pattern from Google Developer Blog
	input := []byte(`<html><body>
		<div class="summary-container">
			<div class="published-date">JAN. 16, 2026</div>
		</div>
		<div class="date-time">
			<span class="post-date">January 16</span>
		</div>
		<time itemprop="datePublished">2026-01-16</time>
		<pre><code class="language-python">print("hello")</code></pre>
		<p>Normal content that should remain.</p>
	</body></html>`)

	result := service.RemoveMetadataElementsForTest(input)

	// Should remove date elements (Safari Reader style: /date/.test(className))
	require.NotContains(t, result, "published-date")
	require.NotContains(t, result, "JAN. 16, 2026")
	require.NotContains(t, result, "date-time")
	require.NotContains(t, result, "post-date")

	// Should remove itemprop="datePublished" elements
	require.NotContains(t, result, "datePublished")

	// Should preserve normal content and code blocks
	require.Contains(t, result, `class="language-python"`)
	require.Contains(t, result, `print(&#34;hello&#34;)`)
	require.Contains(t, result, "Normal content that should remain")
}

// TestRemoveMetadataElements_MediumStyle tests date removal for Medium-style blogs.
func TestRemoveMetadataElements_MediumStyle(t *testing.T) {
	input := []byte(`<html><body>
		<div class="article-meta">
			<time class="datetime" datetime="2026-01-15T10:30:00Z">Jan 15</time>
			<span class="reading-time">5 min read</span>
		</div>
		<article>
			<h1>Article Title</h1>
			<p>Article content here.</p>
		</article>
	</body></html>`)

	result := service.RemoveMetadataElementsForTest(input)

	// Should remove datetime class element
	require.NotContains(t, result, "datetime")
	require.NotContains(t, result, "Jan 15")

	// Should preserve article content
	require.Contains(t, result, "Article Title")
	require.Contains(t, result, "Article content here")
	require.Contains(t, result, "reading-time")
}

// TestRemoveMetadataElements_WordPressStyle tests date removal for WordPress blogs.
func TestRemoveMetadataElements_WordPressStyle(t *testing.T) {
	input := []byte(`<html><body>
		<div class="entry-meta">
			<span class="posted-on">
				<time class="entry-date published" datetime="2026-01-10">January 10, 2026</time>
			</span>
			<span class="byline">by Author</span>
		</div>
		<div class="entry-content">
			<p>WordPress article content.</p>
		</div>
	</body></html>`)

	result := service.RemoveMetadataElementsForTest(input)

	// Should remove entry-date class element
	require.NotContains(t, result, "entry-date")
	require.NotContains(t, result, "January 10, 2026")

	// Should preserve article content
	require.Contains(t, result, "WordPress article content")
}

// TestRemoveMetadataElements_PreservesUpdateDate tests that "updated" dates are also removed.
func TestRemoveMetadataElements_PreservesUpdateDate(t *testing.T) {
	input := []byte(`<html><body>
		<div class="post-info">
			<span class="publish-date">Published: 2026-01-01</span>
			<span class="update-date">Updated: 2026-01-15</span>
		</div>
		<p>Content here.</p>
	</body></html>`)

	result := service.RemoveMetadataElementsForTest(input)

	// Should remove both publish-date and update-date (both contain "date")
	require.NotContains(t, result, "publish-date")
	require.NotContains(t, result, "update-date")
	require.NotContains(t, result, "Published: 2026-01-01")
	require.NotContains(t, result, "Updated: 2026-01-15")

	// Should preserve content
	require.Contains(t, result, "Content here")
}

// TestReadabilityService_PreservesCodeBlockLanguageClass tests code highlighting preservation.
// Regression test: go-readability strips class attributes by default.
// Real case: https://developers.googleblog.com/en/a-guide-to-fine-tuning-functiongemma/
func TestReadabilityService_PreservesCodeBlockLanguageClass(t *testing.T) {
	htmlContent := `<!DOCTYPE html>
<html><head><title>Code Test</title></head>
<body>
<article>
<h1>Code Highlighting Test</h1>
<p>This article contains code blocks with language classes.</p>
<pre><code class="language-python">def hello():
    print("hello world")

if __name__ == "__main__":
    hello()</code></pre>
<p>JavaScript example:</p>
<pre><code class="language-javascript">const greet = () => {
    console.log("hello world");
};

greet();</code></pre>
<p>Go example:</p>
<pre><code class="language-go">package main

import "fmt"

func main() {
    fmt.Println("hello world")
}</code></pre>
<p>Plain code block without language:</p>
<pre><code>plain text here</code></pre>
</article>
</body></html>`

	result, err := service.ParseHTMLForTest(htmlContent, "https://example.com/test")
	require.NoError(t, err)

	// Verify language classes are preserved
	require.Contains(t, result, `class="language-python"`, "language-python class should be preserved")
	require.Contains(t, result, `class="language-javascript"`, "language-javascript class should be preserved")
	require.Contains(t, result, `class="language-go"`, "language-go class should be preserved")

	// Verify code content is preserved
	require.Contains(t, result, "def hello():")
	require.Contains(t, result, "const greet")
	require.Contains(t, result, "package main")
}

// TestReadabilityService_HandlesComplexHTML tests parsing of complex real-world HTML.
// Note: Readability's algorithm requires sufficient content to identify article body.
func TestReadabilityService_HandlesComplexHTML(t *testing.T) {
	htmlContent := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Complex Article</title>
</head>
<body>
<header><nav>Navigation here</nav></header>
<main>
<article>
<h1>Main Article Title</h1>
<p class="lead">This is the lead paragraph with important information about the topic we are discussing today.</p>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
<figure>
<img src="https://example.com/image.jpg" alt="Example image">
<figcaption>Image caption here</figcaption>
</figure>
<h2>Section One</h2>
<p>Content for section one with <a href="https://example.com">a link</a>. This section contains detailed information about the first topic. We need enough text here for Readability to properly identify this as article content.</p>
<p>Additional paragraph in section one to provide more context and information about the subject matter being discussed.</p>
<blockquote>
<p>This is a blockquote from someone important. It provides valuable insight into the topic.</p>
</blockquote>
<h2>Section Two</h2>
<p>This section covers the second major topic of our article. It includes lists and tables.</p>
<ul>
<li>List item one with description</li>
<li>List item two with description</li>
<li>List item three with description</li>
</ul>
<p>Here is a table showing some data:</p>
<table>
<thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>
<tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody>
</table>
<p>Final paragraph wrapping up the article content with a conclusion and summary of the key points discussed.</p>
</article>
</main>
<footer>Footer content</footer>
</body>
</html>`

	result, err := service.ParseHTMLForTest(htmlContent, "https://example.com/complex")
	require.NoError(t, err)

	// Should preserve main article content
	require.Contains(t, result, "This is the lead paragraph")
	require.Contains(t, result, "Section One")
	require.Contains(t, result, "Section Two")
	require.Contains(t, result, "This is a blockquote")

	// Should preserve structured elements
	require.Contains(t, result, "List item one")
}
