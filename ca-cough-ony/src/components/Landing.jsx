import Button from './Button'

export default function Landing({ handleClickAbout, handleClickExplore }) {
  return (
    <div className='min-h-screen bg-[#f4f3ef] flex flex-col items-center justify-center text-center bg-cover bg-no-repeat bg-center px-4'>
      {/* Title */}
      <h1 className='text-4xl md:text-5xl font-light mb-2 font-[Poppins,sans-serif]'>
        Human Health Sounds
      </h1>

      {/* Divider */}
      <div className='w-12 h-[1px] bg-gray-400 my-4'></div>

      {/* Synopsis */}
      <p className='text-gray-600 max-w-md text-lg leading-relaxed mb-8 font-[Poppins,sans-serif]'>
        Thousands of human health sounds visualized using machine learning.
      </p>

      {/* Buttons */}
      <div className='flex flex-col sm:flex-row gap-4'>
        <Button variant='filled' handleClick={handleClickExplore}>EXPLORE</Button>
        <Button variant='outlined' handleClick={handleClickAbout} >ABOUT THIS PROJECT</Button>
      </div>
    </div>
  )
}
