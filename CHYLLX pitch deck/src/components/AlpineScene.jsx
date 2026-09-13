import React from 'react';

const glacier = 'https://peakvisor.com/photo/HD/Hohe-Tauern-schlatenkees-glacier-venediger-group-that-core-2222628841.jpg';
const danube = 'https://www.novo-monde.com/app/uploads/2022/09/vienne-danube-1600x1000.jpg';
const vienna = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Vienna%20Austria%20Skyline%20Aerial,%20October%202024.jpg';
const mozart = 'https://www.campusfrance.org/sites/default/files/medias/images/2017-11/PHC_Amadeus.jpg';

export default function AlpineScene(){
  return <div className="austria-stage" aria-hidden="true">
    <div className="scene scene-alps scene-problem">
      <div className="problem-photo"/>
      <div className="problem-grid"/>
      <div className="problem-wave"/>
      <div className="scene-caption">THE UNSEEN LAYER · PLACE / MEMORY / SOUND</div>
    </div>
    <div className="scene scene-glacier" style={{'--scene-image':`url("${glacier}")`}}>
      <div className="image-plane"/><div className="ice-haze"/>
      <div className="scene-caption">SCHLATENKEES · ICE / WIND / MELTWATER</div>
    </div>
    <div className="scene scene-danube" style={{'--scene-image':`url("${danube}")`}}>
      <div className="image-plane"/><div className="river-light"/>
      <svg className="river-wave" viewBox="0 0 1400 260" preserveAspectRatio="none"><path d="M-60 180 C180 70 350 230 560 138 S930 62 1150 145 S1390 204 1480 100"/></svg>
      <div className="scene-caption">DANUBE · CURRENT / CITY / MEMORY</div>
    </div>
    <div className="scene scene-vienna" style={{'--scene-image':`url("${vienna}")`}}>
      <div className="image-plane"/><div className="vienna-wash"/>
      <div className="notation">𝄞 · ♩ · ♪ · ♫ · ♩ · 𝄞</div>
      <div className="scene-caption">VIENNA · MUSICAL DNA</div>
    </div>
    <div className="composer-portrait" aria-label="Wolfgang Amadeus Mozart"/>
  </div>
}
