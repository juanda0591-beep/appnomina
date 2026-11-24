import './MarcaLuxarma.css'

export default function MarcaLuxarma({ className = '' }) {
  return <span className={`marca-luxarma ${className}`}>
    <img src="/marca/luxarma-logo.png" alt="LUXARMA · Armarios y tocadores" width="1536" height="1024" decoding="async"/>
  </span>
}
