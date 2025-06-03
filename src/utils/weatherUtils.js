import clearDay from '../assets/weather/sunny.gif';
import cloudyDay from '../assets/weather/cloudyDay.gif';
import rainyDay from '../assets/weather/rainyDay.gif';
import clearNight from '../assets/weather/clearskyNight.gif';
import cloudyNight from '../assets/weather/cloudyNight.gif';
import rainyNight from '../assets/weather/rainyNight.gif';
import rainyNight2 from '../assets/weather/lightRain.gif';
import defaultWeather from '../assets/weather/defaultweather.gif';

import sunnyIcon from '../assets/weather/sunny.png';
import moonIcon from '../assets/weather/moon.png';
import cloudsIcon from '../assets/weather/clouds.png';
import rainIcon from '../assets/weather/rain.png';
import thunderIcon from '../assets/weather/thunder.png';
import sunnyWithCloudsIcon from '../assets/weather/sunny.png';
import cloudyMoonIcon from '../assets/weather/moon.png';

export const getTimeOfDay = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
};

export const getWeatherImage = (weatherData) => {
  if (!weatherData?.weather?.length) return defaultWeather;
  
  const timeOfDay = getTimeOfDay();
  const isDaytime = timeOfDay !== "night";
  const weatherCondition = String(weatherData.weather[0].main).toLowerCase();

  if (weatherCondition.includes("clear")) return isDaytime ? clearDay : clearNight;
  if (weatherCondition.includes("cloud")) return isDaytime ? cloudyDay : cloudyNight;
  if (weatherCondition.includes("rain") || weatherCondition.includes("drizzle")) {
    return isDaytime ? rainyDay : rainyNight2;
  }
  if (weatherCondition.includes("thunder")) return rainyNight;
  if (weatherCondition.includes("snow")) return isDaytime ? cloudyDay : cloudyNight;
  return defaultWeather;
};

export const getWeatherIcon = (weatherCondition, currentTime, weatherData) => {
  const timeOfDay = getTimeOfDay(currentTime);
  const isNight = timeOfDay === "night";
  const condition = String(weatherCondition).toLowerCase();
  const cloudPercentage = weatherData?.clouds?.all || 0;

  switch (condition) {
    case "clear":
      return {
        icon: isNight ? moonIcon : sunnyIcon,
        isNight
      };
    case "clouds":
    case "scattered clouds":
      return {
        icon: isNight 
          ? (cloudPercentage > 50 ? cloudyMoonIcon : moonIcon)
          : (cloudPercentage > 50 ? sunnyWithCloudsIcon : sunnyIcon),
        isNight
      };
    case "broken clouds":
      return {
        icon: isNight ? cloudyMoonIcon : sunnyWithCloudsIcon,
        isNight
      };
    case "overcast clouds":
      return {
        icon: cloudsIcon,
        isNight
      };
    case "rain":
    case "drizzle":
    case "shower rain":
      return {
        icon: rainIcon,
        isNight
      };
    case "thunderstorm":
      return {
        icon: thunderIcon,
        isNight
      };
    default:
      return {
        icon: cloudsIcon,
        isNight
      };
  }
};