import React, { useState, useEffect } from "react";
import "../blog/style.css";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Container, Row, Col } from "react-bootstrap";
import { meta } from "../../content_option";
import { useParams, Link } from "react-router-dom";
import DOMPurify from "dompurify";

export const HamRadioPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHamRadioPost();
  }, [slug]);

  const fetchHamRadioPost = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/hamradio/posts/${slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Post not found');
        }
        throw new Error('Failed to fetch HAM radio post');
      }

      const data = await response.json();
      setPost(data.post);
      setError(null);
    } catch (err) {
      console.error('Error fetching HAM radio post:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container className="About-header">
        <div className="blog-loading">
          <div className="cyber-loader"></div>
          <p>Loading post...</p>
        </div>
      </Container>
    );
  }

  if (error || !post) {
    return (
      <Container className="About-header">
        <div className="blog-error">
          <h1>Post not found</h1>
          <p>{error || 'The requested HAM radio post could not be found.'}</p>
          <Link to="/hamradio" className="btn btn-cyber">← Back to HAM Radio</Link>
        </div>
      </Container>
    );
  }

  return (
    <HelmetProvider>
      <Container className="About-header blog-post-container">
        <Helmet>
          <meta charSet="utf-8" />
          <title>{post.title} | HAM Radio | {meta.title}</title>
          <meta name="description" content={post.excerpt} />
        </Helmet>

        <Row className="mb-5 mt-3 pt-md-3">
          <Col lg="10" className="mx-auto">
            <Link to="/hamradio" className="blog-back-link">← Back to HAM Radio</Link>

            <div className="blog-post-header">
              <div className="blog-meta">
                <span className="blog-date">{post.date}</span>
                <span className="blog-reading-time">{post.readingTime} min read</span>
              </div>

              <h1 className="blog-post-title glitch" data-text={post.title}>
                {post.title}
              </h1>

              <div className="blog-tags">
                {post.tags && post.tags.map((tag, idx) => (
                  <span key={idx} className="blog-tag">{tag}</span>
                ))}
              </div>
            </div>

            <div className="blog-post-content">
              <div dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(post.content, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
                  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
                  ALLOW_DATA_ATTR: false
                })
              }} />
            </div>

            {post.sources && post.sources.length > 0 && (
              <div className="blog-sources">
                <h3>Sources</h3>
                <ul>
                  {post.sources.map((source, idx) => (
                    <li key={idx}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </HelmetProvider>
  );
};
