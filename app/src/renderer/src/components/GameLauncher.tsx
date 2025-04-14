import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'

interface GameLauncherProps {
  image: string
  progress: number
  downloadSpeed: string
  downloadSize: string
  remainingTime: string
  isDownloading: boolean
  onEvent?: () => void
  buttonLabel?: string
  isButtonDisabled?: boolean
}

export function GameLauncher({
  image,
  progress,
  downloadSpeed,
  downloadSize,
  remainingTime,
  isDownloading,
  onEvent,
  buttonLabel = isDownloading ? "Stop" : "Start",
  isButtonDisabled = false
}: GameLauncherProps): JSX.Element {
  return (
    <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
      <CardContent className="p-0 h-full">
        <div
          className="w-full h-[480px] bg-cover bg-center border-b"
          style={{ backgroundImage: `url(${image})` }}
        />
        <div className="p-4 bg-white flex items-center justify-between h-[120px]">
          <div className="flex-1 mr-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{downloadSize}</span>
              <span>Time remaining: {remainingTime}</span>
            </div>
            <Progress
              value={progress}
              className="h-2"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Download speed: {downloadSpeed}</span>
              <span>{progress}%</span>
            </div>
          </div>

          <Button
            variant={isDownloading ? "destructive" : "default"}
            onClick={onEvent}
            className="h-16 px-8 text-lg font-semibold"
            disabled={isButtonDisabled}
          >
            {buttonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
