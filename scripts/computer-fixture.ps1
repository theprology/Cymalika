Add-Type -AssemblyName PresentationFramework
[xml]$markup=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="Cipher computer fixture" Width="500" Height="250">
  <StackPanel Margin="20">
    <TextBox x:Name="Entry" Text="before" AutomationProperties.Name="Cipher fixture entry"/>
    <Button x:Name="Apply" Content="Apply fixture" Margin="0,20,0,0"/>
    <TextBlock x:Name="Result" Text="not applied"/>
    <PasswordBox Password="fixture-secret-never-read"/>
  </StackPanel>
</Window>
'@
$window=[Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $markup))
$entry=$window.FindName('Entry');$result=$window.FindName('Result')
$window.FindName('Apply').Add_Click({$result.Text='Applied '+$entry.Text})
[void]$window.ShowDialog()
