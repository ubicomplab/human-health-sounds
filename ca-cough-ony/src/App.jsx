import Landing from "./components/Landing"
import { useState } from "react"
import About from "./components/About"
import FastVisualization from "./components/FastVisualization"

export default function App() {

  const [pageNum, setPageNum] = useState(1)

  function handleClickAbout() {
    setPageNum(3)
  }

  function handleClickExplore() {
    console.log("EXPLORE")
    setPageNum(2)
  }

  return (
    <>
      {pageNum === 1 && (
        <Landing handleClickAbout={handleClickAbout} handleClickExplore={handleClickExplore}/>
      )}
      {pageNum === 2 && (
        <FastVisualization handleClickAbout={handleClickAbout}/>
      )}
      {pageNum === 3 && (
        <About handleClickExplore={handleClickExplore}/>
      )}
    </>
  )
}
