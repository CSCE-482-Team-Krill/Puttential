import Link from "next/link";

export default function NotFound() {
  return <div className="page-width empty-page"><span className="eyebrow">OUT OF BOUNDS</span><h1>That page took a wrong turn.</h1><p>Let’s get you back on the course.</p><Link className="primary-button" href="/">Back to today’s puzzle</Link></div>;
}
