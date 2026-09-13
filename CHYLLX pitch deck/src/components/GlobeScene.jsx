import React,{useMemo,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import * as THREE from 'three';

function Globe({progressRef}){
  const group=useRef();
  const rings=useRef();
  const points=useMemo(()=>{const a=[];for(let i=0;i<1100;i++){const phi=Math.acos(1-2*(i+.5)/1100),theta=Math.PI*(1+Math.sqrt(5))*i;a.push(new THREE.Vector3(2.46*Math.cos(theta)*Math.sin(phi),2.46*Math.cos(phi),2.46*Math.sin(theta)*Math.sin(phi)))}return a},[]);
  useFrame((_,d)=>{const p=progressRef?.current||0;if(!group.current)return;group.current.rotation.y+=d*(.04+p*.08);group.current.rotation.x=THREE.MathUtils.lerp(group.current.rotation.x,.14-p*.08,.035);const k=.84+p*.27;group.current.scale.lerp(new THREE.Vector3(k,k,k),.06);if(rings.current)rings.current.rotation.z-=d*.06});
  return <group ref={group}>
    <mesh><sphereGeometry args={[2.36,64,64]}/><meshStandardMaterial color="#0b0b0d" roughness={.88} metalness={.12} transparent opacity={.94}/></mesh>
    {points.map((p,i)=><mesh key={i} position={p} scale={i%53===0?.04:.011}><sphereGeometry args={[1,7,7]}/><meshBasicMaterial color={i%53===0?'#b51f35':'#77777d'} transparent opacity={i%53===0?.9:.29}/></mesh>)}
    <group ref={rings} rotation={[1.2,.1,.2]}><mesh><torusGeometry args={[2.75,.007,6,180]}/><meshBasicMaterial color="#9e1b30" transparent opacity={.24}/></mesh></group>
    <mesh position={[.18,1.37,1.92]}><sphereGeometry args={[.085,24,24]}/><meshBasicMaterial color="#d92f47"/></mesh>
    <mesh position={[.18,1.37,1.92]} scale={2.6}><sphereGeometry args={[.085,24,24]}/><meshBasicMaterial color="#d92f47" transparent opacity={.09}/></mesh>
  </group>
}
export default function GlobeScene({progressRef}){return <Canvas dpr={[1,1.35]} gl={{antialias:true,powerPreference:'high-performance'}} camera={{position:[0,0,7],fov:43}}><ambientLight intensity={1.45}/><directionalLight position={[5,6,5]} intensity={2.1}/><Globe progressRef={progressRef}/></Canvas>}
