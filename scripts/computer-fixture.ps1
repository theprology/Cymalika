Add-Type -AssemblyName PresentationFramework
[xml]$markup=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="Cipher computer fixture" Width="500" Height="250">
  <StackPanel Margin="20">
    <TextBox x:Name="Entry" Text="before" AutomationProperties.Name="Cipher fixture entry"/>
    <Button x:Name="Apply" Content="Apply fixture" Margin="0,20,0,0"/>
    <TextBlock x:Name="Result" Text="not applied"/>
    <PasswordBox x:Name="Password" Password="fixture-secret-never-read"/>
    <TextBlock x:Name="PasswordStatus" Text="Password entry not tested"/>
    <CheckBox x:Name="Permission" Content="Allow demo feature"/>
    <TextBlock x:Name="PermissionStatus" Text="Demo permission: denied"/>
  </StackPanel>
</Window>
'@
$window=[Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $markup))
$entry=$window.FindName('Entry');$result=$window.FindName('Result')
$window.FindName('Apply').Add_Click({$result.Text='Applied '+$entry.Text})
$window.FindName('Password').Add_PasswordChanged({$window.FindName('PasswordStatus').Text=if($window.FindName('Password').Password -eq 'cipher-public-password-fixture'){'Password fixture filled'}else{'Password entry not tested'}})
$window.FindName('Permission').Add_Checked({$window.FindName('PermissionStatus').Text='Demo permission: allowed'})
[void]$window.ShowDialog()
